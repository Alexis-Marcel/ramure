import { useCallback, useEffect, useState } from 'react'
import { api, inviteUrl, ROLE_LABEL, type Invite, type Member, type TreeSummary } from '../api'
import type { Account } from '../auth'
import { copyText } from '../files'

interface Props {
  tree: TreeSummary
  me: Account
  onClose: () => void
  /** l'arbre n'est plus accessible (supprimé ou quitté) */
  onLeft: () => void
}

/** Membres de l'arbre, leurs rôles, et les liens d'invitation. */
export function SharePanel({ tree, me, onClose, onLeft }: Props) {
  const isOwner = tree.role === 'owner'
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api.members(tree.id)
      setMembers(data.members)
      setInvites(data.invites)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [tree.id])

  useEffect(() => {
    let cancelled = false
    api
      .members(tree.id)
      .then((data) => {
        if (cancelled) return
        setMembers(data.members)
        setInvites(data.invites)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [tree.id])

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const copy = async (token: string) => {
    await copyText(inviteUrl(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Partager l'arbre" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Partager « {tree.name} »</h2>
          <button className="close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          <h3 className="section-title">Membres</h3>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <span className="member-name">
                  {m.name}
                  {m.id === me.id && <span className="muted"> (toi)</span>}
                  {m.email && <span className="member-email">{m.email}</span>}
                </span>
                {isOwner && m.role !== 'owner' ? (
                  <span className="member-actions">
                    <select
                      value={m.role}
                      onChange={(e) => run(() => api.setRole(tree.id, m.id, e.target.value as Member['role']))}
                      aria-label={`Rôle de ${m.name}`}
                    >
                      <option value="editor">{ROLE_LABEL.editor}</option>
                      <option value="viewer">{ROLE_LABEL.viewer}</option>
                    </select>
                    <button
                      className="unlink"
                      title={`Retirer ${m.name}`}
                      aria-label={`Retirer ${m.name}`}
                      onClick={() =>
                        confirm(`Retirer ${m.name} de l'arbre ? Son accès est coupé immédiatement.`) &&
                        run(() => api.removeMember(tree.id, m.id))
                      }
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span className="role-badge">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>

          {isOwner && (
            <>
              <h3 className="section-title">Inviter</h3>
              <p className="hint">
                Le lien ajoute la personne à l'arbre quand elle l'ouvre, connectée à son Compte Eriphe.
                Valable 7 jours, révocable à tout moment.
              </p>
              <div className="invite-actions">
                <button className="btn" onClick={() => run(() => api.createInvite(tree.id, 'editor'))}>
                  Lien éditeur
                </button>
                <button className="btn" onClick={() => run(() => api.createInvite(tree.id, 'viewer'))}>
                  Lien lecteur
                </button>
              </div>
              {invites.length > 0 && (
                <ul className="member-list">
                  {invites.map((inv) => (
                    <li key={inv.token}>
                      <span className="member-name">
                        Lien {ROLE_LABEL[inv.role]}
                        <span className="member-email">
                          expire le {new Date(inv.expiresAt).toLocaleDateString('fr-FR')}
                        </span>
                      </span>
                      <span className="member-actions">
                        <button className="btn" onClick={() => copy(inv.token)}>
                          {copied === inv.token ? 'Copié !' : 'Copier'}
                        </button>
                        <button
                          className="unlink"
                          title="Révoquer ce lien"
                          aria-label="Révoquer ce lien"
                          onClick={() => run(() => api.revokeInvite(tree.id, inv.token))}
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">
                <strong>Éditeur</strong> : modifie l'arbre. <strong>Lecteur</strong> : consulte seulement.
              </p>
            </>
          )}

          <div className="danger-zone">
            {isOwner ? (
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!confirm(`Supprimer définitivement « ${tree.name} » pour tous ses membres ?`)) return
                  try {
                    await api.deleteTree(tree.id)
                    onLeft()
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Supprimer l'arbre
              </button>
            ) : (
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!confirm(`Quitter « ${tree.name} » ? Il faudra une nouvelle invitation pour y revenir.`)) return
                  try {
                    await api.removeMember(tree.id, me.id)
                    onLeft()
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Quitter cet arbre
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
