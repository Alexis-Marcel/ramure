import { useStore } from '../store'
import { fullName } from '../types'
import type { Person, Sex } from '../types'

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function EditPanel() {
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const focalId = useStore((s) => s.focalId)
  const select = useStore((s) => s.select)
  const setFocal = useStore((s) => s.setFocal)
  const updatePerson = useStore((s) => s.updatePerson)
  const updateUnion = useStore((s) => s.updateUnion)
  const deletePerson = useStore((s) => s.deletePerson)
  const addParents = useStore((s) => s.addParents)
  const addPartner = useStore((s) => s.addPartner)
  const addChild = useStore((s) => s.addChild)

  const person: Person | undefined = selectedId ? tree.persons[selectedId] : undefined
  if (!person) return null

  const set = (fields: Partial<Person>) => updatePerson(person.id, fields)
  const unions = person.fams.map((id) => tree.unions[id]).filter(Boolean)

  return (
    <aside className="edit-panel">
      <header>
        <h2>{fullName(person)}</h2>
        <button className="close" onClick={() => select(null)} aria-label="Fermer le panneau">
          ×
        </button>
      </header>

      <div className="panel-body">
        <div className="field-row">
          <Field label="Prénom" value={person.givenName} onChange={(v) => set({ givenName: v })} />
          <Field label="Nom" value={person.surname} onChange={(v) => set({ surname: v })} />
        </div>
        <label className="field">
          <span>Sexe</span>
          <select value={person.sex} onChange={(e) => set({ sex: e.target.value as Sex })}>
            <option value="U">Non renseigné</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </select>
        </label>

        <h3>Naissance</h3>
        <div className="field-row">
          <Field
            label="Date"
            value={person.birthDate ?? ''}
            onChange={(v) => set({ birthDate: v })}
            placeholder="12 mars 1902"
          />
          <Field
            label="Lieu"
            value={person.birthPlace ?? ''}
            onChange={(v) => set({ birthPlace: v })}
          />
        </div>

        <h3>Décès</h3>
        <div className="field-row">
          <Field label="Date" value={person.deathDate ?? ''} onChange={(v) => set({ deathDate: v })} />
          <Field
            label="Lieu"
            value={person.deathPlace ?? ''}
            onChange={(v) => set({ deathPlace: v })}
          />
        </div>

        {unions.map((u) => {
          const partner = u.partners.map((p) => tree.persons[p]).find((p) => p && p.id !== person.id)
          return (
            <div key={u.id}>
              <h3>Union{partner ? ` avec ${fullName(partner)}` : ''}</h3>
              <div className="field-row">
                <Field
                  label="Date"
                  value={u.marriageDate ?? ''}
                  onChange={(v) => updateUnion(u.id, { marriageDate: v })}
                />
                <Field
                  label="Lieu"
                  value={u.marriagePlace ?? ''}
                  onChange={(v) => updateUnion(u.id, { marriagePlace: v })}
                />
              </div>
            </div>
          )
        })}

        <h3>Notes</h3>
        <textarea
          value={person.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          placeholder="Métier, anecdotes, sources…"
        />

        <h3>Famille</h3>
        <div className="relation-actions">
          <button onClick={() => addParents(person.id)} disabled={Boolean(person.famc)}>
            {person.famc ? 'Parents déjà renseignés' : 'Ajouter ses parents'}
          </button>
          <button onClick={() => addPartner(person.id)}>Ajouter un·e partenaire</button>
          <button onClick={() => addChild(person.id)}>Ajouter un enfant</button>
          {person.id !== focalId && (
            <button onClick={() => setFocal(person.id)}>Centrer l'arbre sur cette personne</button>
          )}
        </div>

        <button
          className="btn-danger"
          onClick={() => {
            if (confirm(`Supprimer ${fullName(person)} de l'arbre ?`)) deletePerson(person.id)
          }}
        >
          Supprimer cette personne
        </button>
      </div>
    </aside>
  )
}
