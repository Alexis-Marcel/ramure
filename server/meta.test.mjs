import { describe, expect, it } from 'vitest'
import { MetaStore } from './meta.mjs'

const alice = { id: 'alice', name: 'Alice', email: 'a@x.fr' }
const bob = { id: 'bob', name: 'Bob' }
const eve = { id: 'eve', name: 'Eve' }

function setup() {
  const meta = new MetaStore(null)
  const tree = meta.createTree(alice, 'Famille')
  return { meta, id: tree.id }
}

describe('MetaStore', () => {
  it("ne liste que les arbres dont on est membre", () => {
    const { meta, id } = setup()
    expect(meta.listTrees(alice).map((t) => t.id)).toEqual([id])
    expect(meta.listTrees(eve)).toEqual([])
  })

  it("répond « introuvable » à un non-membre, sans révéler que l'arbre existe", () => {
    const { meta, id } = setup()
    expect(() => meta.listMembers(id, eve)).toThrow(/introuvable/)
    expect(() => meta.renameTree(id, eve, 'x')).toThrow(/introuvable/)
    expect(() => meta.deleteTree(id, eve)).toThrow(/introuvable/)
    expect(() => meta.listMembers('nexistepas', eve)).toThrow(/introuvable/)
  })

  it('invitation : rôle donné, réutilisable, révocable, expirable', () => {
    const { meta, id } = setup()
    const inv = meta.createInvite(id, alice, 'viewer')
    expect(meta.describeInvite(inv.token)).toMatchObject({ treeName: 'Famille', role: 'viewer', inviter: 'Alice' })
    meta.acceptInvite(inv.token, bob)
    expect(meta.roleOf(id, bob.id)).toBe('viewer')
    meta.acceptInvite(inv.token, eve)
    expect(meta.roleOf(id, eve.id)).toBe('viewer')

    meta.revokeInvite(id, alice, inv.token)
    expect(() => meta.acceptInvite(inv.token, { id: 'z', name: 'Z' })).toThrow(/invalide/)

    const old = meta.createInvite(id, alice, 'editor')
    meta.data.invites[old.token].expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(() => meta.acceptInvite(old.token, { id: 'y', name: 'Y' })).toThrow(/expirée/)
  })

  it('seul le propriétaire invite, change les rôles, retire, supprime', () => {
    const { meta, id } = setup()
    meta.acceptInvite(meta.createInvite(id, alice, 'editor').token, bob)
    expect(() => meta.createInvite(id, bob, 'editor')).toThrow(/propriétaire/)
    expect(() => meta.setMemberRole(id, bob, alice.id, 'viewer')).toThrow(/propriétaire/)
    expect(() => meta.removeMember(id, bob, alice.id)).toThrow(/propriétaire/)
    expect(() => meta.deleteTree(id, bob)).toThrow(/propriétaire/)
    expect(() => meta.setMemberRole(id, alice, alice.id, 'viewer')).toThrow(/garde son rôle/)
    expect(() => meta.setMemberRole(id, alice, bob.id, 'owner')).toThrow(/invalide/)

    meta.setMemberRole(id, alice, bob.id, 'viewer')
    expect(meta.roleOf(id, bob.id)).toBe('viewer')
    meta.removeMember(id, alice, bob.id)
    expect(meta.roleOf(id, bob.id)).toBeNull()
  })

  it('un membre peut quitter, le propriétaire non', () => {
    const { meta, id } = setup()
    meta.acceptInvite(meta.createInvite(id, alice, 'viewer').token, bob)
    meta.removeMember(id, bob, bob.id)
    expect(meta.roleOf(id, bob.id)).toBeNull()
    expect(() => meta.removeMember(id, alice, alice.id)).toThrow(/ne peut pas quitter/)
  })

  it("un lien lecteur ne rétrograde pas un éditeur, un lien éditeur promeut un lecteur", () => {
    const { meta, id } = setup()
    meta.acceptInvite(meta.createInvite(id, alice, 'editor').token, bob)
    meta.acceptInvite(meta.createInvite(id, alice, 'viewer').token, bob)
    expect(meta.roleOf(id, bob.id)).toBe('editor')
    meta.acceptInvite(meta.createInvite(id, alice, 'viewer').token, eve)
    meta.acceptInvite(meta.createInvite(id, alice, 'editor').token, eve)
    expect(meta.roleOf(id, eve.id)).toBe('editor')
  })

  it("supprimer un arbre supprime ses invitations", () => {
    const { meta, id } = setup()
    const inv = meta.createInvite(id, alice, 'viewer')
    meta.deleteTree(id, alice)
    expect(meta.listTrees(alice)).toEqual([])
    expect(() => meta.describeInvite(inv.token)).toThrow(/invalide/)
  })

  it('refuse un nom vide', () => {
    expect(() => new MetaStore(null).createTree(alice, '   ')).toThrow(/nom/)
  })
})
