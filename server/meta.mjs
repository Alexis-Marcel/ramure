/**
 * Métadonnées du mode comptes : arbres, membres (avec rôle) et invitations.
 *
 * Un arbre est un document Yjs (persisté par y-leveldb sous son identifiant) ;
 * ce fichier dit à qui il appartient et qui peut l'ouvrir. Stockage : un petit
 * JSON réécrit de façon atomique (fichier temporaire puis renommage) — largement
 * suffisant pour une famille, et sauvegardé avec le reste du dossier de données.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

/** @typedef {'owner' | 'editor' | 'viewer'} Role */
/** @typedef {{ id: string, name: string, email?: string }} Account */

export const ROLES = /** @type {const} */ (['owner', 'editor', 'viewer'])
const INVITE_DAYS = 7

/** Identifiant d'arbre : même format que les anciens espaces (^[a-z0-9-]{8,64}$). */
export function randomId(length = 24) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  return [...randomBytes(length)].map((b) => alphabet[b % 32]).join('')
}

export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export class MetaStore {
  /** @param {string | null} file chemin du JSON, null = en mémoire (tests) */
  constructor(file) {
    this.file = file
    this.data = { trees: {}, invites: {} }
    if (file && existsSync(file)) this.data = JSON.parse(readFileSync(file, 'utf8'))
  }

  save() {
    if (!this.file) return
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  /** @param {string} treeId @param {string} userId @returns {Role | null} */
  roleOf(treeId, userId) {
    return this.data.trees[treeId]?.members[userId]?.role ?? null
  }

  /** @param {string} treeId @param {Account} user @param {Role[]} allowed */
  require(treeId, user, allowed = ROLES) {
    const tree = this.data.trees[treeId]
    const role = tree ? this.roleOf(treeId, user.id) : null
    // même réponse pour « inexistant » et « pas membre » : on ne révèle pas qu'un arbre existe
    if (!tree || !role) throw new HttpError(404, 'Arbre introuvable')
    if (!allowed.includes(role)) throw new HttpError(403, 'Action réservée au propriétaire')
    this.touchMember(tree, user)
    return { tree, role }
  }

  /** Garde le nom et l'e-mail des membres à jour (ils viennent du Compte Eriphe). */
  touchMember(tree, user) {
    const m = tree.members[user.id]
    if (m && (m.name !== user.name || m.email !== user.email)) {
      m.name = user.name
      m.email = user.email
      this.save()
    }
  }

  /** @param {Account} user */
  listTrees(user) {
    return Object.values(this.data.trees)
      .filter((t) => t.members[user.id])
      .map((t) => this.summary(t, user))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  summary(tree, user) {
    const owner = Object.values(tree.members).find((m) => m.role === 'owner')
    return {
      id: tree.id,
      name: tree.name,
      role: tree.members[user.id].role,
      owner: owner?.name ?? '',
      members: Object.keys(tree.members).length,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
    }
  }

  /** @param {Account} user @param {string} name @param {string} [id] identifiant imposé (migration) */
  createTree(user, name, id = randomId()) {
    const now = new Date().toISOString()
    const tree = {
      id,
      name: cleanName(name),
      createdAt: now,
      updatedAt: now,
      members: { [user.id]: { role: 'owner', name: user.name, email: user.email, addedAt: now } },
    }
    this.data.trees[id] = tree
    this.save()
    return this.summary(tree, user)
  }

  renameTree(treeId, user, name) {
    const { tree } = this.require(treeId, user, ['owner', 'editor'])
    tree.name = cleanName(name)
    tree.updatedAt = new Date().toISOString()
    this.save()
    return this.summary(tree, user)
  }

  deleteTree(treeId, user) {
    this.require(treeId, user, ['owner'])
    delete this.data.trees[treeId]
    for (const [token, inv] of Object.entries(this.data.invites)) {
      if (inv.treeId === treeId) delete this.data.invites[token]
    }
    this.save()
  }

  /** Marque l'arbre modifié (tri de la liste) — au plus une écriture par minute. */
  markUpdated(treeId) {
    const tree = this.data.trees[treeId]
    if (!tree) return
    const now = new Date()
    if (now.getTime() - new Date(tree.updatedAt).getTime() < 60_000) return
    tree.updatedAt = now.toISOString()
    this.save()
  }

  listMembers(treeId, user) {
    const { tree, role } = this.require(treeId, user)
    const members = Object.entries(tree.members).map(([id, m]) => ({ id, ...m }))
    const invites =
      role === 'owner'
        ? Object.entries(this.data.invites)
            .filter(([, inv]) => inv.treeId === treeId && !expired(inv))
            .map(([token, inv]) => ({ token, role: inv.role, expiresAt: inv.expiresAt }))
        : []
    return { members, invites }
  }

  setMemberRole(treeId, user, memberId, role) {
    const { tree } = this.require(treeId, user, ['owner'])
    if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Rôle invalide')
    const m = tree.members[memberId]
    if (!m) throw new HttpError(404, 'Membre introuvable')
    if (m.role === 'owner') throw new HttpError(400, 'Le propriétaire garde son rôle')
    m.role = role
    this.save()
  }

  /** Le propriétaire retire quelqu'un, ou un membre quitte l'arbre de lui-même. */
  removeMember(treeId, user, memberId) {
    const { tree, role } = this.require(treeId, user)
    if (memberId !== user.id && role !== 'owner') throw new HttpError(403, 'Action réservée au propriétaire')
    const m = tree.members[memberId]
    if (!m) throw new HttpError(404, 'Membre introuvable')
    if (m.role === 'owner') throw new HttpError(400, "Le propriétaire ne peut pas quitter son arbre (il peut le supprimer)")
    delete tree.members[memberId]
    this.save()
  }

  createInvite(treeId, user, role) {
    this.require(treeId, user, ['owner'])
    if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Rôle invalide')
    const token = randomId(32)
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()
    this.data.invites[token] = { treeId, role, createdBy: user.id, expiresAt }
    this.save()
    return { token, role, expiresAt }
  }

  revokeInvite(treeId, user, token) {
    this.require(treeId, user, ['owner'])
    const inv = this.data.invites[token]
    if (!inv || inv.treeId !== treeId) throw new HttpError(404, 'Invitation introuvable')
    delete this.data.invites[token]
    this.save()
  }

  /** Ce que voit l'invité avant d'accepter. */
  describeInvite(token) {
    const { inv, tree } = this.validInvite(token)
    const inviter = tree.members[inv.createdBy]?.name ?? ''
    return { treeName: tree.name, role: inv.role, inviter }
  }

  /** Lien utilisable par plusieurs personnes jusqu'à expiration ou révocation. */
  acceptInvite(token, user) {
    const { inv, tree } = this.validInvite(token)
    const current = tree.members[user.id]
    // jamais de rétrogradation : un éditeur qui rouvre un lien « lecteur » reste éditeur
    if (!current) {
      tree.members[user.id] = { role: inv.role, name: user.name, email: user.email, addedAt: new Date().toISOString() }
    } else if (current.role === 'viewer' && inv.role === 'editor') {
      current.role = 'editor'
    }
    this.save()
    return this.summary(tree, user)
  }

  validInvite(token) {
    const inv = this.data.invites[token]
    const tree = inv && this.data.trees[inv.treeId]
    if (!inv || !tree || expired(inv)) throw new HttpError(404, 'Invitation invalide ou expirée')
    return { inv, tree }
  }
}

function expired(inv) {
  return new Date(inv.expiresAt).getTime() < Date.now()
}

function cleanName(name) {
  const n = String(name ?? '').trim().slice(0, 80)
  if (!n) throw new HttpError(400, "Donne un nom à l'arbre")
  return n
}
