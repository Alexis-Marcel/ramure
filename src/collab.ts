import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebsocketProvider } from 'y-websocket'
import type { Tree } from './types'
import { LOCAL_ORIGIN, readTreeFrom, writeTreeTo } from './collab-core'

/**
 * Couche collaborative : l'arbre ouvert vit dans un document Yjs (CRDT).
 * - Toujours persisté localement dans IndexedDB → l'app marche hors-ligne.
 * - Mode local : un seul arbre par navigateur, éventuellement relié à un
 *   « espace famille » à lien secret (serveur sans comptes).
 * - Mode comptes : un document par arbre, synchronisé avec le serveur sous
 *   jeton ; on passe d'un arbre à l'autre sans recharger la page.
 */

const UI_KEY = 'ramure:ui'
const SPACE_KEY = 'ramure:espace'
const LEGACY_KEY = 'ramure:v1'
/** bases IndexedDB des arbres du compte ouverts sur cet appareil (à effacer à la déconnexion) */
const CACHES_KEY = 'ramure:copies'
const LOCAL_DB = 'ramure'
const treeDb = (treeId: string) => `ramure:arbre:${treeId}`

let doc = new Y.Doc()
let persistence: IndexeddbPersistence | null = null
/** clé des préférences d'affichage de l'arbre ouvert (personne centrale…) */
let uiKey = UI_KEY

export const readTree = (): Tree => readTreeFrom(doc)
export const writeTree = (tree: Tree): void => writeTreeTo(doc, tree)

// ----- Abonnements qui suivent l'arbre ouvert -----

const remoteListeners = new Set<(tree: Tree) => void>()
const openedListeners = new Set<() => void>()

function attachDoc(d: Y.Doc) {
  d.on('update', (_update: Uint8Array, origin: unknown) => {
    if (d !== doc || origin === LOCAL_ORIGIN) return
    const tree = readTree()
    for (const cb of remoteListeners) cb(tree)
  })
}
attachDoc(doc)

/** Notifie les changements venant d'ailleurs (autre onglet, autre membre de la famille). */
export function onRemoteChange(cb: (tree: Tree) => void): () => void {
  remoteListeners.add(cb)
  return () => remoteListeners.delete(cb)
}

/** Appelé quand un arbre vient d'être ouvert (copie locale chargée). */
export function onTreeOpened(cb: () => void): () => void {
  openedListeners.add(cb)
  return () => openedListeners.delete(cb)
}

async function switchTo(dbName: string, key: string) {
  provider?.destroy()
  provider = null
  await persistence?.destroy()
  doc.destroy()
  doc = new Y.Doc()
  attachDoc(doc)
  uiKey = key
  persistence = new IndexeddbPersistence(dbName, doc)
  await persistence.whenSynced
}

function opened() {
  notifyStatus()
  for (const cb of openedListeners) cb()
}

// ----- Préférences locales (par appareil et par arbre, jamais synchronisées) -----

export interface UiPrefs {
  focalId?: string
  name?: string
}

export function loadUiPrefs(): UiPrefs {
  try {
    return JSON.parse(localStorage.getItem(uiKey) ?? '{}')
  } catch {
    return {}
  }
}

export function saveUiPrefs(prefs: UiPrefs) {
  try {
    localStorage.setItem(uiKey, JSON.stringify(prefs))
  } catch {
    // stockage indisponible : préférences non persistées
  }
}

// ----- Mode local : l'arbre de ce navigateur -----

/** Ouvre l'arbre local (avec migration depuis l'ancien format localStorage). */
export async function openLocal() {
  await switchTo(LOCAL_DB, UI_KEY)
  if (doc.getMap('persons').size === 0) {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      const data = legacy ? (JSON.parse(legacy) as { tree?: Tree; focalId?: string }) : null
      if (data?.tree && Object.keys(data.tree.persons).length > 0) {
        writeTree(data.tree)
        if (data.focalId) saveUiPrefs({ ...loadUiPrefs(), focalId: data.focalId })
      }
    } catch {
      // ancien format illisible : on démarre vide, le localStorage reste intact
    }
  }
  opened()
}

/** Lit l'arbre local sans l'ouvrir (proposer de l'importer dans le compte). */
export async function peekLocalTree(): Promise<Tree> {
  const d = new Y.Doc()
  const p = new IndexeddbPersistence(LOCAL_DB, d)
  await p.whenSynced
  const tree = readTreeFrom(d)
  await p.destroy()
  d.destroy()
  return tree
}

// ----- Mode comptes : un arbre du serveur -----

export interface TreeAccess {
  /** jeton d'accès courant (renouvelé par l'app au fil de l'eau) */
  getToken: () => Promise<string | null>
  /** accès retiré ou modifié par le propriétaire pendant la session */
  onAccessChanged: () => void
}

/** Ouvre un arbre du compte : copie locale hors-ligne + synchro sous jeton. */
export async function openTree(treeId: string, access: TreeAccess) {
  await switchTo(treeDb(treeId), `${UI_KEY}:${treeId}`)
  rememberCache(treeId)
  const token = (await access.getToken()) ?? ''
  const server = new URL('.', document.baseURI).toString()
  const p = new WebsocketProvider(wsUrl(server), treeId, doc, {
    maxBackoffTime: 8000,
    params: { token },
  })
  provider = p
  // jeton frais à chaque reconnexion (y-websocket recalcule l'URL depuis params)
  p.on('connection-close', (event: CloseEvent | null) => {
    if (event?.code === 4403) access.onAccessChanged()
    void access.getToken().then((t) => {
      if (t) p.params = { token: t }
    })
  })
  p.on('status', notifyStatus)
  p.awareness.on('change', notifyStatus)
  opened()
}

/** Nom affiché aux autres membres connectés (vient du compte). */
export function setPresence(name: string) {
  provider?.awareness.setLocalStateField('user', { name })
}

function rememberCache(treeId: string) {
  const ids = new Set(knownCaches())
  ids.add(treeId)
  localStorage.setItem(CACHES_KEY, JSON.stringify([...ids]))
}

function knownCaches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CACHES_KEY) ?? '[]')
  } catch {
    return []
  }
}

/**
 * Efface de cet appareil les copies des arbres du compte (déconnexion) ou de
 * ceux auxquels on n'a plus accès (`keep` = arbres encore accessibles).
 */
export async function forgetTreeCaches(keep: string[] = []) {
  const ids = knownCaches().filter((id) => !keep.includes(id))
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve) => {
          localStorage.removeItem(`${UI_KEY}:${id}`)
          const req = indexedDB.deleteDatabase(treeDb(id))
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        }),
    ),
  )
  localStorage.setItem(CACHES_KEY, JSON.stringify(knownCaches().filter((id) => keep.includes(id))))
}

/** Ferme l'arbre ouvert (retour à la liste des arbres). */
export async function closeTree() {
  provider?.destroy()
  provider = null
  await persistence?.destroy()
  persistence = null
  notifyStatus()
}

// ----- Espace famille (serveur de sync auto-hébergé, sans comptes) -----

export interface Space {
  /** URL du serveur, ex. https://ramure.mondomaine.fr ou http://192.168.1.10:8484 */
  server: string
  /** identifiant secret de l'espace — fait office de clé d'accès */
  space: string
}

export type SyncStatus = 'off' | 'connecting' | 'connected'

let provider: WebsocketProvider | null = null
const statusListeners = new Set<(s: SyncStatus, peers: string[]) => void>()

function currentStatus(): SyncStatus {
  return !provider ? 'off' : provider.wsconnected ? 'connected' : 'connecting'
}

function currentPeers(): string[] {
  const peers: string[] = []
  provider?.awareness.getStates().forEach((state, clientId) => {
    if (clientId !== doc.clientID && state.user?.name) peers.push(state.user.name as string)
  })
  return peers
}

function notifyStatus() {
  for (const cb of statusListeners) cb(currentStatus(), currentPeers())
}

export function onSyncStatus(cb: (s: SyncStatus, peers: string[]) => void): () => void {
  statusListeners.add(cb)
  cb(currentStatus(), currentPeers())
  return () => {
    statusListeners.delete(cb)
  }
}

function wsUrl(server: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = url.pathname.replace(/\/$/, '') + '/sync'
  return url.toString()
}

/**
 * Détecte si l'app est servie par un serveur Ramure (image Docker) : dans ce
 * cas l'adresse du serveur de sync est celle du site lui-même, inutile de la
 * demander. La version GitHub Pages, elle, répond 404 sur /health.
 */
export async function detectSameOriginServer(): Promise<string | null> {
  try {
    const res = await fetch(new URL('health', location.href), { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status !== 'ok') return null
    const base = new URL('.', location.href)
    return (base.origin + base.pathname).replace(/\/$/, '')
  } catch {
    return null
  }
}

export function currentSpace(): Space | null {
  try {
    return JSON.parse(localStorage.getItem(SPACE_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function joinSpace(space: Space, userName: string) {
  leaveSpace(false)
  provider = new WebsocketProvider(wsUrl(space.server), space.space, doc, {
    maxBackoffTime: 8000,
  })
  provider.awareness.setLocalStateField('user', { name: userName })
  provider.on('status', notifyStatus)
  provider.awareness.on('change', notifyStatus)
  try {
    localStorage.setItem(SPACE_KEY, JSON.stringify(space))
  } catch {
    // non persisté : l'espace devra être rejoint manuellement au prochain lancement
  }
  notifyStatus()
}

export function setUserName(name: string) {
  provider?.awareness.setLocalStateField('user', { name })
  saveUiPrefs({ ...loadUiPrefs(), name })
}

export function leaveSpace(forget = true) {
  provider?.destroy()
  provider = null
  if (forget) localStorage.removeItem(SPACE_KEY)
  notifyStatus()
}

export function randomSpaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz234567'[b % 32]).join('')
}

/** Lien d'invitation à partager avec la famille. */
export function inviteLink(space: Space): string {
  return `${location.origin}${location.pathname}#espace=${encodeURIComponent(space.space)}&serveur=${encodeURIComponent(space.server)}`
}

/** Espace décrit dans l'URL (ouverture d'un lien d'invitation). */
export function spaceFromHash(): Space | null {
  const params = new URLSearchParams(location.hash.slice(1))
  const space = params.get('espace')
  const server = params.get('serveur')
  return space && server ? { space, server } : null
}
