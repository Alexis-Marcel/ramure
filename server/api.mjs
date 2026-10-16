/**
 * API du mode comptes (JSON). Toutes les routes sauf /api/config exigent un
 * jeton du Compte Eriphe ; les droits sur un arbre sont vérifiés par MetaStore.
 */
import { bearer } from './auth.mjs'
import { HttpError } from './meta.mjs'

/**
 * @param {{
 *   meta: import('./meta.mjs').MetaStore,
 *   verify: (token: string) => Promise<import('./meta.mjs').Account>,
 *   config: { issuer: string, clientId: string },
 *   onTreeDeleted?: (treeId: string, tree: object, by: import('./meta.mjs').Account) => Promise<void> | void,
 *   onAccessChanged?: (treeId: string, userId: string) => void,
 * }} ctx
 */
export function createApi({ meta, verify, config, onTreeDeleted = () => {}, onAccessChanged = () => {} }) {
  /** [méthode, motif, gestionnaire(user, params, body)] */
  const routes = [
    ['GET', /^\/api\/me$/, (user) => user],
    ['GET', /^\/api\/trees$/, (user) => meta.listTrees(user)],
    ['POST', /^\/api\/trees$/, (user, _p, body) => meta.createTree(user, body.name)],
    ['PATCH', /^\/api\/trees\/([a-z0-9-]+)$/, (user, [id], body) => meta.renameTree(id, user, body.name)],
    [
      'DELETE',
      /^\/api\/trees\/([a-z0-9-]+)$/,
      async (user, [id], body) => {
        const tree = meta.deleteTree(id, user, body.confirm)
        // on attend la mise en corbeille : l'arbre n'est effacé qu'une fois sa copie écrite
        await onTreeDeleted(id, tree, user)
        return { ok: true }
      },
    ],
    ['GET', /^\/api\/trees\/([a-z0-9-]+)\/members$/, (user, [id]) => meta.listMembers(id, user)],
    [
      'PATCH',
      /^\/api\/trees\/([a-z0-9-]+)\/members\/([^/]+)$/,
      (user, [id, memberId], body) => {
        meta.setMemberRole(id, user, decodeURIComponent(memberId), body.role)
        onAccessChanged(id, decodeURIComponent(memberId))
        return { ok: true }
      },
    ],
    [
      'DELETE',
      /^\/api\/trees\/([a-z0-9-]+)\/members\/([^/]+)$/,
      (user, [id, memberId]) => {
        meta.removeMember(id, user, decodeURIComponent(memberId))
        onAccessChanged(id, decodeURIComponent(memberId))
        return { ok: true }
      },
    ],
    ['POST', /^\/api\/trees\/([a-z0-9-]+)\/invites$/, (user, [id], body) => meta.createInvite(id, user, body.role)],
    [
      'DELETE',
      /^\/api\/trees\/([a-z0-9-]+)\/invites\/([a-z0-9]+)$/,
      (user, [id, token]) => {
        meta.revokeInvite(id, user, token)
        return { ok: true }
      },
    ],
    ['GET', /^\/api\/invites\/([a-z0-9]+)$/, (_user, [token]) => meta.describeInvite(token)],
    ['POST', /^\/api\/invites\/([a-z0-9]+)\/accept$/, (user, [token]) => meta.acceptInvite(token, user)],
  ]

  /** @returns {Promise<boolean>} true si la requête relevait de l'API */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') {
        send(res, 200, { auth: config })
        return true
      }
      const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname))
      if (!route) throw new HttpError(404, 'Route inconnue')
      let user
      try {
        user = await verify(bearer(req, url))
      } catch {
        throw new HttpError(401, 'Connexion requise')
      }
      const params = url.pathname.match(route[1]).slice(1)
      const body = req.method === 'GET' ? {} : await readJson(req)
      send(res, 200, await route[2](user, params, body))
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      if (status === 500) console.error('api :', err)
      send(res, status, { error: status === 500 ? 'Erreur du serveur' : err.message })
    }
    return true
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 16_384) {
        reject(new HttpError(413, 'Requête trop grande'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new HttpError(400, 'JSON invalide'))
      }
    })
    req.on('error', reject)
  })
}
