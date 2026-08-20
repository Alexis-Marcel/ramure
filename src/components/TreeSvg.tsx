import type { TreeLayout } from '../layout'
import { PersonCard } from './PersonCard'

interface Props {
  layout: TreeLayout
  selectedId: string | null
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}

/** Contenu SVG pur de l'arbre — partagé entre le canevas et l'export HTML. */
export function TreeSvg({ layout, selectedId, onSelect, onFocus }: Props) {
  return (
    <g id="ramure-world">
      <defs>
        <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#17211B" floodOpacity="0.09" />
        </filter>
      </defs>
      {layout.links.map((link, i) =>
        link.kind === 'lineage' ? (
          <path
            key={i}
            d={link.d}
            fill="none"
            stroke="#C6CFC4"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : (
          <path
            key={i}
            d={link.d}
            fill="none"
            stroke="#C6CFC4"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="0.5 6"
          />
        ),
      )}
      {layout.nodes.map((node) => (
        <PersonCard
          key={node.person.id}
          node={node}
          selected={node.person.id === selectedId}
          onSelect={onSelect}
          onFocus={onFocus}
        />
      ))}
    </g>
  )
}
