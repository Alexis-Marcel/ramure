import type { TreeLayout } from '../layout'
import { PersonCard, type CardActions } from './PersonCard'

interface Props {
  layout: TreeLayout
  selectedId: string | null
  onSelect: (id: string) => void
  onFocus: (id: string) => void
  /** absent dans l'export HTML statique */
  actions?: CardActions
}

/** Contenu SVG pur de l'arbre — partagé entre le canevas et l'export HTML. */
export function TreeSvg({ layout, selectedId, onSelect, onFocus, actions }: Props) {
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
          <g key={i}>
            <path
              d={link.d}
              fill="none"
              stroke="#C6CFC4"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="0.5 6"
            />
            {link.broken && link.mid && (
              // symbole généalogique de rupture d'union : deux barres obliques
              <path
                d={`M ${link.mid.x - 6} ${link.mid.y + 5} L ${link.mid.x - 1} ${link.mid.y - 5} M ${link.mid.x + 1} ${link.mid.y + 5} L ${link.mid.x + 6} ${link.mid.y - 5}`}
                fill="none"
                stroke="#6B7469"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            )}
          </g>
        ),
      )}
      {layout.nodes.map((node) => (
        <PersonCard
          key={node.person.id}
          node={node}
          selected={node.person.id === selectedId}
          onSelect={onSelect}
          onFocus={onFocus}
          actions={actions}
        />
      ))}
    </g>
  )
}
