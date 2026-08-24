import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebsocketProvider } from 'y-websocket'
import type { Tree } from './types'
import { LOCAL_ORIGIN, readTreeFrom, writeTreeTo } from './collab-core'

/**
 * Couche collaborative : l'arbre vit dans un document Yjs (CRDT).
 * - Toujours persisté localement dans IndexedDB → l'app marche hors-ligne.
 * - Optionnellement relié à un « espace famille » sur un serveur de sync
 *   auto-hébergé (image Docker fournie) : les modifications de chacun
 *   fusionnent automatiquement, même faites hors-ligne.
 */

const UI_KEY = 'ramure:ui'
const SPACE_KEY = 'ramure:espace'
const LEGACY_KEY = 'ramure:v1'

export const doc = new Y.Doc()

export const readTree = (): Tree => readTreeFrom(doc)
export const writeTree = (tree: Tree): void => writeTreeTo(doc, tree)

/** Notifie les changements venant d'ailleurs (autre onglet, autre membre de la famille). */
export function onRemoteChange(cb: (tree: Tree) => void): () => void {
  const handler = (_update: Uint8Array, origin: unknown) => {
    if (origin !== LOCAL_ORIGIN) cb(readTree())
  }
  doc.on('update', handler)
  return () => doc.off('update', handler)
}

// ----- Préférences locales (par appareil, jamais synchronisées) -----

export interface UiPrefs {
  focalId?: string
  name?: string
}

export function loadUiPrefs(): UiPrefs {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveUiPrefs(prefs: UiPrefs) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs))
  } catch {
    // stockage indisponible : préférences non persistées
  }
}

// ----- Persistance locale + migration depuis l'ancien format localStorage -----

const persistence = new IndexeddbPersistence('ramure', doc)

export const localReady: Promise<void> = persistence.whenSynced.then(() => {
  if (doc.getMap('persons').size > 0) return
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return
    const data = JSON.parse(legacy) as { tree?: Tree; focalId?: string }
    if (data.tree && Object.keys(data.tree.persons).length > 0) {
      writeTree(data.tree)
      if (data.focalId) saveUiPrefs({ ...loadUiPrefs(), focalId: data.focalId })
    }
  } catch {
    // ancien format illisible : on démarre vide, le localStorage reste intact
  }
})

// ----- Espace famille (serveur de sync auto-hébergé) -----

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
