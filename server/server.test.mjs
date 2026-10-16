/**
 * Test de bout en bout du mode comptes : vrai serveur (processus enfant),
 * faux fournisseur OIDC (clés RSA locales), vrais échanges Yjs sur WebSocket.
 * Objectif : qu'aucun arbre ne fuite et qu'un lecteur ne puisse rien modifier.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import WebSocket from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const PORT = 18000 + Math.floor(Math.random() * 1000)
const BASE = `http://127.0.0.1:${PORT}`
let idp, idpUrl, key, otherKey, child, dataDir

async function token(sub, { name = sub, audience = 'ramure', signWith = key, issuer = idpUrl } = {}) {
  return new SignJWT({ name, email: `${sub}@test.fr` })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('5m')
    .sign(signWith.privateKey)
}

async function api(method, path, tok, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}

/** Mini-client Yjs : se synchronise avec le serveur et pousse ses modifications. */
function connect(treeId, tok) {
  const doc = new Y.Doc()
  const qs = tok ? `?token=${encodeURIComponent(tok)}` : ''
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync/${treeId}${qs}`)
  ws.binaryType = 'arraybuffer'
  const synced = new Promise((resolve) => (doc._synced = resolve))
  const opened = new Promise((resolve) => {
    ws.on('open', () => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, 0)
      syncProtocol.writeSyncStep1(enc, doc)
      ws.send(encoding.toUint8Array(enc))
      resolve('open')
    })
    ws.on('unexpected-response', () => resolve('refusé'))
    ws.on('error', () => resolve('refusé'))
  })
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)))
  ws.on('message', (data) => {
    const dec = decoding.createDecoder(new Uint8Array(data))
    if (decoding.readVarUint(dec) !== 0) return
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 0)
    const type = syncProtocol.readSyncMessage(dec, enc, doc, ws)
    if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc))
    if (type === syncProtocol.messageYjsSyncStep2) doc._synced()
  })
  doc.on('update', (update, origin) => {
    if (origin === ws || ws.readyState !== WebSocket.OPEN) return
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 0)
    syncProtocol.writeUpdate(enc, update)
    ws.send(encoding.toUint8Array(enc))
  })
  return { doc, ws, opened, synced, closed }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const persons = (doc) => [...doc.getMap('persons').keys()].sort()

beforeAll(async () => {
  key = await generateKeyPair('RS256')
  otherKey = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(key.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  idp = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url.endsWith('/.well-known/openid-configuration')) {
      res.end(JSON.stringify({ issuer: idpUrl, jwks_uri: `${idpUrl}jwks/` }))
    } else if (req.url.includes('/jwks/')) {
      res.end(JSON.stringify({ keys: [jwk] }))
    } else res.writeHead(404).end('{}')
  })
  await new Promise((r) => idp.listen(0, '127.0.0.1', r))
  idpUrl = `http://127.0.0.1:${idp.address().port}/application/o/ramure/`

  dataDir = mkdtempSync(join(tmpdir(), 'ramure-test-'))
  child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('.', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, OIDC_ISSUER: idpUrl, OIDC_CLIENT_ID: 'ramure' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('prêt') && resolve())
    child.stderr.on('data', (d) => process.stderr.write(d))
    child.on('exit', (code) => reject(new Error(`serveur arrêté (${code})`)))
  })
}, 30_000)

afterAll(() => {
  child?.kill()
  idp?.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
})

describe('mode comptes', () => {
  let treeId, alice, bob, eve

  it("annonce la configuration de connexion", async () => {
    const r = await api('GET', '/api/config')
    expect(r.body.auth).toEqual({ issuer: idpUrl, clientId: 'ramure' })
  })

  it('refuse les jetons absents, forgés, ou émis pour une autre application', async () => {
    expect((await api('GET', '/api/trees')).status).toBe(401)
    expect((await api('GET', '/api/trees', await token('x', { signWith: otherKey }))).status).toBe(401)
    expect((await api('GET', '/api/trees', await token('x', { audience: 'gemline' }))).status).toBe(401)
    expect((await api('GET', '/api/trees', await token('x', { issuer: 'https://evil/' }))).status).toBe(401)
  })

  it("crée un arbre et l'alimente par la synchro", async () => {
    alice = await token('alice', { name: 'Alice' })
    bob = await token('bob', { name: 'Bob' })
    eve = await token('eve', { name: 'Eve' })
    const r = await api('POST', '/api/trees', alice, { name: 'Famille' })
    expect(r.status).toBe(200)
    treeId = r.body.id
    const a = connect(treeId, alice)
    expect(await a.opened).toBe('open')
    await a.synced
    a.doc.getMap('persons').set('@I1@', { id: '@I1@', givenName: 'Victor' })
    await wait(200)
    a.ws.close()
  })

  it("un inconnu ne voit ni ne lit l'arbre", async () => {
    expect((await api('GET', '/api/trees', eve)).body).toEqual([])
    expect((await api('GET', `/api/trees/${treeId}/members`, eve)).status).toBe(404)
    expect(await connect(treeId, eve).opened).toBe('refusé')
    expect(await connect(treeId).opened).toBe('refusé')
    expect(await connect(treeId, await token('alice', { signWith: otherKey })).opened).toBe('refusé')
  })

  it('un ancien espace à lien secret ne donne plus accès à rien', async () => {
    expect(await connect('abcdefghijklmnopqrstuvwx').opened).toBe('refusé')
    expect(await connect('abcdefghijklmnopqrstuvwx', eve).opened).toBe('refusé')
  })

  it('un lecteur lit mais ne peut rien modifier', async () => {
    const inv = await api('POST', `/api/trees/${treeId}/invites`, alice, { role: 'viewer' })
    expect((await api('POST', `/api/invites/${inv.body.token}/accept`, bob)).status).toBe(200)
    const b = connect(treeId, bob)
    expect(await b.opened).toBe('open')
    await b.synced
    expect(persons(b.doc)).toEqual(['@I1@'])

    b.doc.getMap('persons').set('@I2@', { id: '@I2@', givenName: 'Pirate' })
    b.doc.getMap('persons').delete('@I1@')
    await wait(300)
    b.ws.close()

    const a = connect(treeId, alice)
    await a.synced
    expect(persons(a.doc)).toEqual(['@I1@'])
    a.ws.close()
  })

  it("retirer un membre coupe sa connexion et ses accès", async () => {
    const b = connect(treeId, bob)
    await b.synced
    expect((await api('DELETE', `/api/trees/${treeId}/members/bob`, alice)).status).toBe(200)
    expect(await b.closed).toBe(4403)
    expect(await connect(treeId, bob).opened).toBe('refusé')
    expect((await api('GET', '/api/trees', bob)).body).toEqual([])
  })

  it("supprimer l'arbre : nom exact exigé, copie en corbeille, contenu effacé", async () => {
    expect((await api('DELETE', `/api/trees/${treeId}`, bob, { confirm: 'Famille' })).status).toBe(404)
    // sans le nom (clic de travers, bug de l'appli) : refusé, l'arbre reste
    expect((await api('DELETE', `/api/trees/${treeId}`, alice)).status).toBe(400)
    expect((await api('DELETE', `/api/trees/${treeId}`, alice, { confirm: 'Autre' })).status).toBe(400)
    expect((await api('GET', '/api/trees', alice)).body.map((t) => t.id)).toContain(treeId)
    expect((await api('DELETE', `/api/trees/${treeId}`, alice, { confirm: 'Famille' })).status).toBe(200)
    const trash = readdirSync(join(dataDir, 'corbeille'))
    const copy = trash.find((f) => f.startsWith(treeId) && f.endsWith('.json'))
    expect(copy).toBeTruthy()
    expect(JSON.parse(readFileSync(join(dataDir, 'corbeille', copy), 'utf8'))).toMatchObject({ tree: { name: 'Famille' }, persons: 1 })
    expect(await connect(treeId, alice).opened).toBe('refusé')
    // recréé sous le même identifiant (cas de la migration), il repart vide
    const r = await api('POST', '/api/trees', alice, { name: 'Nouveau' })
    const a = connect(r.body.id, alice)
    await a.synced
    expect(persons(a.doc)).toEqual([])
    a.ws.close()
  })

  it('la corbeille se restaure (serveur arrêté)', async () => {
    child.kill()
    await new Promise((r) => child.once('exit', r))
    const copy = readdirSync(join(dataDir, 'corbeille')).find((f) => f.startsWith(treeId) && f.endsWith('.json'))
    const out = execFileSync(process.execPath, ['restaurer.mjs', join(dataDir, 'corbeille', copy)], {
      cwd: new URL('.', import.meta.url).pathname,
      env: { ...process.env, DATA_DIR: dataDir },
    }).toString()
    expect(out).toMatch(/« Famille » restauré : 1 personnes/)
    const restoredMeta = JSON.parse(readFileSync(join(dataDir, 'ramure-meta.json'), 'utf8'))
    expect(restoredMeta.trees[treeId].members.alice.role).toBe('owner')
  })
})
