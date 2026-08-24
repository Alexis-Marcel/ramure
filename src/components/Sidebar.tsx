import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { fullName, lifespan } from '../types'

export function Sidebar() {
  const tree = useStore((s) => s.tree)
  const focalId = useStore((s) => s.focalId)
  const setFocal = useStore((s) => s.setFocal)
  const [query, setQuery] = useState('')

  const persons = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(tree.persons)
      .filter(
        (p) =>
          !q ||
          fullName(p).toLowerCase().includes(q) ||
          (p.marriedName ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) =>
        `${a.surname} ${a.givenName}`.localeCompare(`${b.surname} ${b.givenName}`, 'fr'),
      )
  }, [tree, query])

  const total = Object.keys(tree.persons).length
  if (total === 0) return null

  return (
    <aside className="sidebar">
      <input
        type="search"
        className="search"
        placeholder="Rechercher une personne…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Rechercher une personne"
      />
      <p className="sidebar-count">
        {total} personne{total > 1 ? 's' : ''}
      </p>
      <ul className="person-list">
        {persons.map((p) => (
          <li key={p.id}>
            <button
              className={p.id === focalId ? 'active' : ''}
              onClick={() => setFocal(p.id)}
              title="Centrer l'arbre sur cette personne"
            >
              <span className="person-name">
                {fullName(p)}
                {p.marriedName ? ` (${p.marriedName})` : ''}
              </span>
              <span className="person-dates">{lifespan(p)}</span>
            </button>
          </li>
        ))}
        {persons.length === 0 && <li className="no-result">Personne ne correspond.</li>}
      </ul>
    </aside>
  )
}
