import { useMemo, useState } from 'react'
import type { Person } from '../types'
import { fullName, lifespan } from '../types'

interface Props {
  title: string
  createLabel: string
  persons: Person[]
  onPick: (id: string) => void
  onCreate: () => void
  onClose: () => void
}

/** Choisir une personne existante de l'arbre, ou en créer une nouvelle. */
export function PersonPicker({ title, createLabel, persons, onPick, onCreate, onClose }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return persons
      .filter((p) => !q || fullName(p).toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'))
  }, [persons, query])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="modal-body">
          <button className="btn btn-primary" onClick={onCreate}>
            {createLabel}
          </button>
          {persons.length > 0 && (
            <>
              <p className="hint">Ou choisissez une personne déjà dans l'arbre :</p>
              <input
                type="search"
                className="search"
                placeholder="Rechercher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher une personne"
              />
              <ul className="person-list picker-list">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => onPick(p.id)}>
                      <span className="person-name">{fullName(p)}</span>
                      <span className="person-dates">{lifespan(p)}</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="no-result">Personne ne correspond.</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
