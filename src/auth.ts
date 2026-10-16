import { InMemoryWebStorage, UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

/**
 * Comptes (mode serveur avec OIDC, ex. le Compte Eriphe). La configuration
 * vient du serveur (/api/config) : la même image sert avec ou sans comptes,
 * et la version GitHub Pages n'en a pas.
 *
 * Jetons en mémoire seulement, sans jeton de rafraîchissement : à chaque
 * chargement et à chaque renouvellement, une iframe invisible (prompt=none)
 * redemande un jeton au fournisseur — déjà connecté chez lui, on l'est ici.
 * Le retour se fait sur la racine de l'app (pas de sous-chemin : les fichiers
 * sont référencés en relatif).
 */

export interface AuthConfig {
  issuer: string
  clientId: string
}

export interface Account {
  id: string
  name: string
  email?: string
}

const base = () => new URL('.', document.baseURI).toString()

export async function loadConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(new URL('api/config', document.baseURI), { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { auth?: AuthConfig | null }
    return data.auth ?? null
  } catch {
    return null
  }
}

let manager: UserManager | null = null

export function setupAuth(config: AuthConfig): UserManager {
  manager ??= new UserManager({
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: base(),
    silent_redirect_uri: base(),
    post_logout_redirect_uri: base(),
    scope: 'openid email profile',
    silentRequestTimeoutInSeconds: 5,
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  })
  return manager
}

/** Retour du fournisseur sur la page : ?code=… ou ?error=… avec un state. */
export function isAuthResponse(): boolean {
  const p = new URLSearchParams(location.search)
  return p.has('state') && (p.has('code') || p.has('error'))
}

/** Dans l'iframe silencieuse : transmet la réponse à la page parente, sans rendre l'app. */
export function isSilentFrame(): boolean {
  return window.parent !== window && isAuthResponse()
}

export async function completeSilentFrame(config: AuthConfig) {
  await setupAuth(config).signinSilentCallback().catch(() => {})
}

export function toAccount(u: User | null): Account | null {
  if (!u || u.expired) return null
  const p = u.profile
  return {
    id: p.sub,
    name: (p.name || p.preferred_username || p.email || 'Sans nom').trim(),
    email: p.email,
  }
}

/**
 * Session au démarrage : retour de connexion à terminer, sinon tentative
 * silencieuse. Renvoie aussi l'adresse où l'on voulait aller (state).
 */
export async function startSession(): Promise<{ user: User | null; next: string | null }> {
  const um = manager!
  if (isAuthResponse()) {
    try {
      const user = await um.signinRedirectCallback()
      const next = (user.state as { next?: string } | undefined)?.next ?? null
      return { user, next }
    } catch {
      history.replaceState(null, '', base())
      return { user: null, next: null }
    }
  }
  try {
    return { user: await um.signinSilent(), next: null }
  } catch {
    return { user: null, next: null }
  }
}

/** Envoie vers la page de connexion ; `next` = adresse relative où revenir (ex. ?arbre=…). */
export function signIn(next = location.search) {
  return manager!.signinRedirect({ state: { next } })
}

export async function signOut() {
  await manager!.signoutRedirect()
}

export async function getToken(): Promise<string | null> {
  const u = await manager?.getUser()
  return u && !u.expired ? u.access_token : null
}

export function onUserChange(cb: (u: User | null) => void): () => void {
  const um = manager!
  const loaded = (u: User) => cb(u)
  const unloaded = () => cb(null)
  // fournisseur déconnecté entre-temps : la session locale tombe aussi
  const renewError = () => void um.removeUser()
  um.events.addUserLoaded(loaded)
  um.events.addUserUnloaded(unloaded)
  um.events.addSilentRenewError(renewError)
  return () => {
    um.events.removeUserLoaded(loaded)
    um.events.removeUserUnloaded(unloaded)
    um.events.removeSilentRenewError(renewError)
  }
}
