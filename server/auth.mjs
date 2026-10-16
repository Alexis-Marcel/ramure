/**
 * Comptes : jetons d'accès émis par un fournisseur OIDC (en production le
 * Compte Eriphe / Authentik). Le serveur découvre la clé publique (JWKS) de
 * l'émetteur et exige son `iss` et notre `aud` : un jeton émis pour une autre
 * application du même fournisseur est refusé.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

/** @typedef {import('./meta.mjs').Account} Account */

/**
 * @param {{ issuer: string, audience: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<(token: string) => Promise<Account>>}
 */
export async function createVerifier({ issuer, audience, fetchImpl = fetch }) {
  const res = await fetchImpl(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration')
  if (!res.ok) throw new Error(`découverte OIDC : HTTP ${res.status}`)
  const discovery = await res.json()
  if (!discovery.jwks_uri) throw new Error('découverte OIDC : pas de jwks_uri')
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  return verifierFromKeys(jwks, discovery.issuer, audience)
}

/** Séparé de la découverte pour les tests (clés locales). */
export function verifierFromKeys(keys, issuer, audience) {
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, { issuer, audience })
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('jeton sans sujet')
    const name = String(payload.name || payload.preferred_username || payload.email || 'Sans nom').trim()
    return { id: payload.sub, name, email: typeof payload.email === 'string' ? payload.email : undefined }
  }
}

/** Jeton « Authorization: Bearer … », ou ?token= pour le WebSocket (pas d'en-têtes possibles). */
export function bearer(req, url) {
  const h = req.headers.authorization ?? ''
  if (h.startsWith('Bearer ')) return h.slice(7).trim()
  return url.searchParams.get('token') ?? ''
}
