/**
 * Serveur Ramure : un seul process qui
 *  - sert l'application (fichiers statiques du build Vite),
 *  - synchronise les espaces famille via le protocole Yjs sur WebSocket
 *    (chemin /sync/<espace>), compatible avec le client y-websocket,
 *  - persiste chaque espace dans LevelDB (dossier DATA_DIR, à monter en volume).
 *
 * Aucune base de données externe : LevelDB est embarqué, la sauvegarde
 * consiste à copier le dossier de données.
 *
 * Deux modes :
 *  - sans OIDC_ISSUER (défaut) : espaces famille à lien secret, comme avant ;
 *  - avec OIDC_ISSUER + OIDC_CLIENT_ID : comptes (Compte Eriphe…). Chaque arbre
 *    a ses membres et leurs rôles ; la synchro exige un jeton valide et
 *    l'appartenance à l'arbre, un lecteur ne peut rien modifier, et les liens
 *    secrets ne donnent plus accès à rien.
 */
import http from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { LeveldbPersistence } from 'y-leveldb'
import { createApi } from './api.mjs'
import { bearer, createVerifier } from './auth.mjs'
import { MetaStore } from './meta.mjs'

const PORT = Number(process.env.PORT ?? 8484)
const DATA_DIR = process.env.DATA_DIR ?? './data'
const STATIC_DIR = process.env.STATIC_DIR ?? './public'
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? ''
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? ''

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const ldb = new LeveldbPersistence(DATA_DIR)

// ----- Mode comptes -----

const accounts = Boolean(OIDC_ISSUER && OIDC_CLIENT_ID)
// à côté des fichiers LevelDB, qui ignorent les fichiers qui ne sont pas les leurs
const meta = accounts ? new MetaStore(join(DATA_DIR, 'ramure-meta.json')) : null
// Ne pas démarrer « ouvert » quand des comptes sont configurés : on plante plutôt.
const verify = accounts ? await createVerifier({ issuer: OIDC_ISSUER, audience: OIDC_CLIENT_ID }) : null
const api =
  accounts &&
  createApi({
    meta,
    verify,
    config: { issuer: OIDC_ISSUER, clientId: OIDC_CLIENT_ID },
    onTreeDeleted: async (treeId, tree, by) => {
      // Corbeille d'abord : copie complète (contenu Yjs + membres) avant d'effacer quoi que ce soit.
      // Restauration : node restaurer.mjs <fichier .json> (serveur arrêté).
      const loaded = await spaces.get(treeId)
      const doc = loaded ?? (await ldb.getYDoc(treeId))
      const dir = join(DATA_DIR, 'corbeille')
      mkdirSync(dir, { recursive: true })
      const base = join(dir, `${treeId}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
      writeFileSync(`${base}.yjs`, Y.encodeStateAsUpdate(doc), { mode: 0o600 })
      writeFileSync(
        `${base}.json`,
        JSON.stringify({ tree, deletedAt: new Date().toISOString(), deletedBy: by.id, persons: doc.getMap('persons').size }, null, 2),
        { mode: 0o600 },
      )
      console.log(`arbre ${treeId} (« ${tree.name} ») supprimé par ${by.name} — copie : ${base}.json`)
      loaded?.closeConnections()
      spaces.delete(treeId)
      await ldb.clearDocument(treeId)
    },
    onAccessChanged: async (treeId, userId) => {
      // l'intéressé se reconnecte avec ses nouveaux droits (ou est refusé)
      ;(await spaces.get(treeId))?.closeConnections(userId)
    },
  })

class SpaceDoc extends Y.Doc {
  /** @param {string} name */
  constructor(name) {
    super({ gc: true })
    this.name = name
    /** @type {Map<import('ws').WebSocket, Set<number>>} connexion → clientIDs d'awareness */
    this.conns = new Map()
    this.awareness = new awarenessProtocol.Awareness(this)
    this.awareness.setLocalState(null)

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const controlled = origin && this.conns.get(origin)
      if (controlled) {
        added.forEach((id) => controlled.add(id))
        removed.forEach((id) => controlled.delete(id))
      }
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, added.concat(updated, removed)),
      )
      this.broadcast(encoding.toUint8Array(enc))
    })

    this.on('update', (update) => {
      ldb.storeUpdate(this.name, update)
      meta?.markUpdated(this.name)
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc))
    })
  }

  /** Ferme les connexions (toutes, ou celles d'un compte). @param {string} [userId] */
  closeConnections(userId) {
    for (const conn of this.conns.keys()) {
      if (!userId || conn.userId === userId) conn.close(4403, 'accès modifié')
    }
  }

  /** @param {Uint8Array} message */
  broadcast(message) {
    for (const conn of this.conns.keys()) {
      try {
        conn.send(message)
      } catch {
        conn.close()
      }
    }
  }
}

/** @type {Map<string, Promise<SpaceDoc>>} */
const spaces = new Map()

function getSpace(name) {
  let space = spaces.get(name)
  if (!space) {
    space = (async () => {
      const doc = new SpaceDoc(name)
      const persisted = await ldb.getYDoc(name)
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(persisted))
      return doc
    })()
    spaces.set(name, space)
  }
  return space
}

/**
 * @param {import('ws').WebSocket} conn
 * @param {SpaceDoc} doc
 */
function setupConnection(conn, doc) {
  doc.conns.set(conn, new Set())
  conn.binaryType = 'arraybuffer'

  conn.on('message', (data) => {
    try {
      const dec = decoding.createDecoder(new Uint8Array(data))
      const type = decoding.readVarUint(dec)
      if (type === MESSAGE_SYNC) {
        // lecteur : il peut demander l'état (étape 1), jamais envoyer de modification
        if (conn.readOnly && decoding.peekVarUint(dec) !== syncProtocol.messageYjsSyncStep1) return
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_SYNC)
        syncProtocol.readSyncMessage(dec, enc, doc, conn)
        if (encoding.length(enc) > 1) conn.send(encoding.toUint8Array(enc))
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(dec), conn)
      }
    } catch (err) {
      console.error(`espace ${doc.name} : message invalide`, err)
    }
  })

  const close = () => {
    const controlled = doc.conns.get(conn)
    doc.conns.delete(conn)
    if (controlled) {
      awarenessProtocol.removeAwarenessStates(doc.awareness, [...controlled], null)
    }
  }
  conn.on('close', close)
  conn.on('error', close)

  // poignée de main : état du document puis présences connues
  {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(enc, doc)
    conn.send(encoding.toUint8Array(enc))
  }
  const states = doc.awareness.getStates()
  if (states.size > 0) {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, [...states.keys()]),
    )
    conn.send(encoding.toUint8Array(enc))
  }
}

// ----- Fichiers statiques (l'app) -----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"status":"ok"}')
    return
  }
  if (api && (await api(req, res, url))) return
  if (url.pathname === '/api/config') {
    // mode espaces à lien secret : l'app n'affiche pas de connexion
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"auth":null}')
    return
  }
  let file = normalize(join(STATIC_DIR, url.pathname))
  if (!file.startsWith(normalize(STATIC_DIR)) || !existsSync(file) || statSync(file).isDirectory()) {
    // application monopage : toute route inconnue renvoie l'app
    file = join(STATIC_DIR, 'index.html')
  }
  const ext = extname(file)
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(readFileSync(file))
})

// ----- WebSocket + keepalive (les reverse proxies coupent les connexions muettes) -----

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/sync/')) {
    socket.destroy()
    return
  }
  const name = url.pathname.slice('/sync/'.length)
  if (!/^[a-z0-9-]{8,64}$/.test(name)) {
    socket.destroy()
    return
  }
  /** @type {{ userId?: string, readOnly: boolean }} */
  let access = { readOnly: false }
  if (accounts) {
    // jeton valide et membre de l'arbre, sinon refus avant même l'ouverture
    let role = null
    try {
      const user = await verify(bearer(req, url))
      role = meta.roleOf(name, user.id)
      access = { userId: user.id, readOnly: role === 'viewer' }
    } catch {
      // jeton absent, expiré ou invalide
    }
    if (!role) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
  }
  // chargé avant d'accepter : sinon le premier message du client (sa demande
  // d'état) peut arriver avant que l'écoute soit en place, et se perdre
  const space = await getSpace(name)
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isAlive = true
    ws.userId = access.userId
    ws.readOnly = access.readOnly
    ws.on('pong', () => {
      ws.isAlive = true
    })
    setupConnection(ws, space)
  })
})

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 30000)

server.listen(PORT, () => {
  console.log(`Ramure prêt sur le port ${PORT} (données : ${DATA_DIR})`)
})
