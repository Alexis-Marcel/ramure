import { useEffect, useState } from 'react'
import {
  currentSpace,
  detectSameOriginServer,
  inviteLink,
  joinSpace,
  leaveSpace,
  loadUiPrefs,
  randomSpaceId,
  setUserName,
  type Space,
  type SyncStatus,
} from '../collab'
import { useSync } from './useSync'

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'hors connexion',
  connecting: 'connexion…',
  connected: 'connecté',
}

export function CollabPanel({ onClose }: { onClose: () => void }) {
  const { status, peers } = useSync()
  const [space, setSpace] = useState<Space | null>(currentSpace())
  const [name, setName] = useState(loadUiPrefs().name ?? '')
  const [server, setServer] = useState(space?.server ?? '')
  const [localServer, setLocalServer] = useState<string | null>(null)
  const [otherServer, setOtherServer] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    detectSameOriginServer().then(setLocalServer)
  }, [])

  const effectiveServer = localServer && !otherServer ? localServer : server.trim()

  const join = (s: Space) => {
    joinSpace(s, name.trim() || 'Sans nom')
    setUserName(name.trim() || 'Sans nom')
    setSpace(s)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Espace famille"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Espace famille</h2>
          <button className="close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Votre prénom (visible par la famille)</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (space) setUserName(e.target.value.trim() || 'Sans nom')
              }}
              placeholder="Alexis"
            />
          </label>

          {!space && (
            <>
              <p className="hint">
                Un espace famille synchronise l'arbre entre tous ses membres, en direct ou en
                décalé, via votre propre serveur — vos données ne passent par aucun service tiers.
              </p>
              {localServer && !otherServer ? (
                <p className="hint">
                  Synchronisation via ce site : <code>{localServer}</code>{' '}
                  <button className="link" onClick={() => setOtherServer(true)}>
                    utiliser un autre serveur
                  </button>
                </p>
              ) : (
                <label className="field">
                  <span>Adresse de votre serveur</span>
                  <input
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    placeholder="https://ramure.mondomaine.fr"
                    inputMode="url"
                  />
                  {!localServer && (
                    <span className="hint">
                      Le serveur s'installe en un conteneur Docker — voir le README du projet.
                    </span>
                  )}
                </label>
              )}
              <button
                className="btn btn-primary"
                disabled={!effectiveServer}
                onClick={() => {
                  try {
                    join({ server: new URL(effectiveServer).toString(), space: randomSpaceId() })
                  } catch {
                    alert('Cette adresse de serveur ne semble pas valide.')
                  }
                }}
              >
                Créer l'espace famille
              </button>
              <p className="hint">
                Invité par quelqu'un ? Ouvrez simplement le lien qu'il vous a partagé : vous
                rejoindrez son espace automatiquement.
              </p>
            </>
          )}

          {space && (
            <>
              <div className="sync-status">
                <span className={`dot dot-${status}`} aria-hidden="true" />
                {STATUS_LABEL[status]}
                {status === 'connected' && (
                  <span className="peers">
                    {peers.length === 0
                      ? ' — vous êtes seul·e en ligne'
                      : ` — en ligne avec ${peers.join(', ')}`}
                  </span>
                )}
              </div>
              <p className="hint">
                Serveur : <code>{space.server}</code>
              </p>
              <label className="field">
                <span>Lien d'invitation — envoyez-le à la famille</span>
                <div className="invite-row">
                  <input readOnly value={inviteLink(space)} onFocus={(e) => e.target.select()} />
                  <button
                    className="btn"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteLink(space))
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </label>
              <p className="hint">
                Toute personne disposant de ce lien peut lire et modifier l'arbre : partagez-le en
                privé.
              </p>
              <button
                className="btn-danger"
                onClick={() => {
                  leaveSpace()
                  setSpace(null)
                }}
              >
                Quitter l'espace (votre copie locale est conservée)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
