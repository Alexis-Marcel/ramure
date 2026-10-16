import { useEffect, useState } from 'react'
import { api, ROLE_LABEL, type Invite } from '../api'
import { signIn } from '../auth'

/** Accueil sans session : se connecter, ou essayer sans compte. */
export function Landing({ onLocal, reason }: { onLocal: () => void; reason?: string }) {
  return (
    <div className="landing">
      <h1>Ramure</h1>
      <p className="landing-lead">
        Ton arbre généalogique, à construire et partager en famille. Chaque arbre n'est visible que
        par les personnes que tu invites.
      </p>
      {reason && <p className="home-notice">{reason}</p>}
      <button className="btn btn-primary" onClick={() => void signIn()}>
        Se connecter avec le Compte Eriphe
      </button>
      <button className="link" onClick={onLocal}>
        Essayer sans compte (l'arbre reste dans ce navigateur)
      </button>
    </div>
  )
}

interface InviteProps {
  token: string
  onAccepted: (treeId: string) => void
  onCancel: () => void
}

/** Ouverture d'un lien d'invitation, une fois connecté. */
export function InviteView({ token, onAccepted, onCancel }: InviteProps) {
  const [info, setInfo] = useState<{ treeName: string; role: Invite['role']; inviter: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .describeInvite(token)
      .then(setInfo)
      .catch((e: Error) => setError(e.message))
  }, [token])

  return (
    <div className="landing">
      {error ? (
        <>
          <h1>Invitation</h1>
          <p className="form-error">{error}</p>
          <p className="muted">Demande un nouveau lien à la personne qui t'a invité·e.</p>
          <button className="btn" onClick={onCancel}>
            Mes arbres
          </button>
        </>
      ) : !info ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          <h1>« {info.treeName} »</h1>
          <p className="landing-lead">
            {info.inviter || 'Quelqu’un'} t'invite à rejoindre cet arbre en tant que{' '}
            <strong>{ROLE_LABEL[info.role]}</strong>
            {info.role === 'viewer' ? ' (consultation seulement)' : ' (tu pourras le modifier)'}.
          </p>
          <button
            className="btn btn-primary"
            onClick={() =>
              api
                .acceptInvite(token)
                .then((t) => onAccepted(t.id))
                .catch((e: Error) => setError(e.message))
            }
          >
            Rejoindre l'arbre
          </button>
          <button className="link" onClick={onCancel}>
            Plus tard
          </button>
        </>
      )}
    </div>
  )
}
