import { useStore } from '../store'
import { fullName } from '../types'

/** Demande avec quel·le partenaire rattacher l'enfant quand il y a plusieurs unions. */
export function ChildUnionChooser() {
  const tree = useStore((s) => s.tree)
  const pending = useStore((s) => s.pendingChild)
  const resolve = useStore((s) => s.resolveAddChild)
  const cancel = useStore((s) => s.cancelAddChild)

  if (!pending) return null
  const person = tree.persons[pending.personId]
  if (!person) return null

  const unions = person.fams.map((id) => tree.unions[id]).filter(Boolean)

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div
        className="modal"
        role="dialog"
        aria-label="Choisir l'union"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Enfant de quel couple ?</h2>
          <button className="close" onClick={cancel} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="hint">
            {fullName(person)} a plusieurs unions : choisissez celle à laquelle rattacher
            l'enfant.
          </p>
          <div className="relation-actions">
            {unions.map((u) => {
              const partner = u.partners
                .map((p) => tree.persons[p])
                .find((p) => p && p.id !== person.id)
              return (
                <button key={u.id} onClick={() => resolve(u.id)}>
                  {partner
                    ? `Avec ${fullName(partner)}`
                    : 'Union sans partenaire renseigné'}
                  {u.marriageDate ? <span className="person-dates"> — {u.marriageDate}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
