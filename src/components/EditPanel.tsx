import { useState } from 'react'
import { collectAncestors, collectDescendants } from '../relatives'
import { useStore } from '../store'
import { fullName, lifespan } from '../types'
import type { Person, Sex, Union } from '../types'
import { PersonPicker } from './PersonPicker'

type PickTarget =
  | { kind: 'parents' }
  | { kind: 'partner' }
  | { kind: 'child'; unionId?: string }

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

/** Ligne d'une personne reliée : ouvre sa fiche, ou retire le lien (sans la supprimer). */
function LinkRow({
  person,
  onOpen,
  onUnlink,
  unlinkLabel,
}: {
  person: Person
  onOpen: () => void
  onUnlink: () => void
  unlinkLabel: string
}) {
  return (
    <li className="link-row">
      <button className="link-person" onClick={onOpen} title="Ouvrir cette fiche">
        <span className="person-name">{fullName(person)}</span>
        <span className="person-dates">{lifespan(person)}</span>
      </button>
      <button className="unlink" onClick={onUnlink} title={unlinkLabel} aria-label={unlinkLabel}>
        ×
      </button>
    </li>
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
  const removeUnionPartner = useStore((s) => s.removeUnionPartner)
  const removeUnionChild = useStore((s) => s.removeUnionChild)

  const [pick, setPick] = useState<PickTarget | null>(null)

  const person: Person | undefined = selectedId ? tree.persons[selectedId] : undefined
  if (!person) return null

  const set = (fields: Partial<Person>) => updatePerson(person.id, fields)
  const famcUnion: Union | undefined = person.famc ? tree.unions[person.famc] : undefined
  const parents = (famcUnion?.partners ?? [])
    .map((id) => tree.persons[id])
    .filter((p): p is Person => Boolean(p))
  const unions = person.fams
    .map((id) => tree.unions[id])
    .filter((u): u is Union => Boolean(u))

  /** Personnes reliables pour chaque type de lien (sans créer d'incohérence). */
  const eligible = (kind: PickTarget['kind']): Person[] => {
    const ancestors = collectAncestors(tree, person.id)
    const descendants = collectDescendants(tree, person.id)
    const partners = new Set(
      unions.flatMap((u) => u.partners).filter((id) => id !== person.id),
    )
    const existingParents = new Set(famcUnion?.partners ?? [])
    return Object.values(tree.persons).filter((p) => {
      if (p.id === person.id || ancestors.has(p.id) || descendants.has(p.id) || partners.has(p.id))
        return false
      if (kind === 'parents' && existingParents.has(p.id)) return false
      if (kind === 'child' && p.famc) return false
      return true
    })
  }

  const doLink = (id?: string) => {
    if (!pick) return
    if (pick.kind === 'parents') addParents(person.id, id)
    if (pick.kind === 'partner') addPartner(person.id, id)
    if (pick.kind === 'child') addChild(person.id, id, pick.unionId)
    setPick(null)
  }

  const pickerText = !pick
    ? null
    : pick.kind === 'parents'
      ? {
          title: 'Ajouter un parent',
          createLabel: parents.length === 1 ? "Créer l'autre parent" : 'Créer ses deux parents',
        }
      : pick.kind === 'partner'
        ? { title: 'Ajouter un·e partenaire', createLabel: 'Créer un·e nouveau·elle partenaire' }
        : { title: 'Ajouter un enfant', createLabel: 'Créer un nouvel enfant' }

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

        <h3>Parents</h3>
        {parents.length > 0 && (
          <ul className="link-list">
            {parents.map((pp) => (
              <LinkRow
                key={pp.id}
                person={pp}
                onOpen={() => select(pp.id)}
                unlinkLabel="Retirer ce lien de parenté"
                onUnlink={() => {
                  if (
                    famcUnion &&
                    confirm(
                      `Retirer ${fullName(pp)} des parents de ${fullName(person)} ? La personne reste dans l'arbre.`,
                    )
                  )
                    removeUnionPartner(famcUnion.id, pp.id)
                }}
              />
            ))}
          </ul>
        )}
        {parents.length < 2 && (
          <button className="relation-add" onClick={() => setPick({ kind: 'parents' })}>
            {parents.length === 1 ? "+ Ajouter l'autre parent" : '+ Ajouter ses parents'}
          </button>
        )}

        {unions.map((u) => {
          const partner = u.partners
            .map((p) => tree.persons[p])
            .find((p): p is Person => Boolean(p) && p.id !== person.id)
          const children = u.children
            .map((c) => tree.persons[c])
            .filter((c): c is Person => Boolean(c))
          return (
            <div key={u.id} className="union-block">
              <h3>
                {partner ? `Union avec ${fullName(partner)}` : 'Union'}
                {(u.separated || u.divorceDate) && ' · séparés'}
              </h3>
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
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(u.separated || u.divorceDate)}
                  onChange={(e) =>
                    updateUnion(u.id, {
                      separated: e.target.checked || undefined,
                      divorceDate: e.target.checked ? u.divorceDate : undefined,
                    })
                  }
                />
                <span>Séparés ou divorcés</span>
              </label>
              {(u.separated || u.divorceDate) && (
                <Field
                  label="Date de séparation"
                  value={u.divorceDate ?? ''}
                  onChange={(v) => updateUnion(u.id, { divorceDate: v })}
                />
              )}
              {children.length > 0 && (
                <ul className="link-list">
                  {children.map((c) => (
                    <LinkRow
                      key={c.id}
                      person={c}
                      onOpen={() => select(c.id)}
                      unlinkLabel="Retirer cet enfant de l'union"
                      onUnlink={() => {
                        if (
                          confirm(
                            `Retirer ${fullName(c)} des enfants de cette union ? La personne reste dans l'arbre.`,
                          )
                        )
                          removeUnionChild(u.id, c.id)
                      }}
                    />
                  ))}
                </ul>
              )}
              <button
                className="relation-add"
                onClick={() => setPick({ kind: 'child', unionId: u.id })}
              >
                + Ajouter un enfant
              </button>
              {partner && (
                <button
                  className="relation-add subtle"
                  onClick={() => {
                    if (
                      confirm(
                        `Retirer le lien entre ${fullName(person)} et ${fullName(partner)} ? Les deux restent dans l'arbre.`,
                      )
                    )
                      removeUnionPartner(u.id, partner.id)
                  }}
                >
                  Retirer ce lien d'union
                </button>
              )}
            </div>
          )
        })}

        <button className="relation-add" onClick={() => setPick({ kind: 'partner' })}>
          + Ajouter un·e partenaire
        </button>
        {unions.length === 0 && (
          <button className="relation-add" onClick={() => setPick({ kind: 'child' })}>
            + Ajouter un enfant
          </button>
        )}

        <h3>Notes</h3>
        <textarea
          value={person.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          placeholder="Métier, anecdotes, sources…"
        />

        {person.id !== focalId && (
          <button className="relation-add" onClick={() => setFocal(person.id)}>
            Centrer l'arbre sur cette personne
          </button>
        )}
        <button
          className="btn-danger"
          onClick={() => {
            if (confirm(`Supprimer ${fullName(person)} de l'arbre ?`)) deletePerson(person.id)
          }}
        >
          Supprimer cette personne
        </button>
      </div>

      {pick && pickerText && (
        <PersonPicker
          title={pickerText.title}
          createLabel={pickerText.createLabel}
          persons={eligible(pick.kind)}
          onPick={(id) => doLink(id)}
          onCreate={() => doLink()}
          onClose={() => setPick(null)}
        />
      )}
    </aside>
  )
}
