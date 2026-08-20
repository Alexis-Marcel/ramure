import type { LayoutNode } from '../layout'
import { CARD_H, CARD_W } from '../layout'
import { fullName, lifespan } from '../types'

const UI_FONT = "'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif"

/** Paires [fond, texte] des avatars — attribuées de façon stable par personne. */
const AVATAR_COLORS: Array<[string, string]> = [
  ['#DCFCE7', '#15803D'],
  ['#DBEAFE', '#1D4ED8'],
  ['#FEF3C7', '#B45309'],
  ['#FCE7F3', '#BE185D'],
  ['#EDE9FE', '#6D28D9'],
  ['#CCFBF1', '#0F766E'],
  ['#FFEDD5', '#C2410C'],
  ['#FEE2E2', '#B91C1C'],
]

function avatarColors(id: string): [string, string] {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(given: string, surname: string): string {
  const a = given.trim()[0] ?? ''
  const b = surname.trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

interface Props {
  node: LayoutNode
  selected: boolean
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}

/**
 * Tout le style est porté en attributs inline pour que l'export HTML
 * autonome reste fidèle sans feuille de style.
 */
export function PersonCard({ node, selected, onSelect, onFocus }: Props) {
  const { person, x, y, isFocal } = node
  const name = truncate(fullName(person), 20)
  const dates = truncate(lifespan(person), 26)
  const place = truncate(person.birthPlace ?? '', 24)
  const [avBg, avFg] = avatarColors(person.id)
  const active = selected || isFocal

  return (
    <g
      className="person-card"
      transform={`translate(${x}, ${y})`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(person.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onFocus(person.id)
      }}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={CARD_W}
        height={CARD_H}
        rx={16}
        fill="#FFFFFF"
        stroke={active ? '#17A673' : '#E4E8E2'}
        strokeWidth={active ? 2 : 1}
        filter="url(#card-shadow)"
      />
      <circle cx={32} cy={CARD_H / 2} r={17} fill={avBg} />
      <text
        x={32}
        y={CARD_H / 2}
        dy={4.5}
        textAnchor="middle"
        fontFamily={UI_FONT}
        fontSize={13}
        fontWeight={600}
        fill={avFg}
      >
        {initials(person.givenName, person.surname)}
      </text>
      {isFocal && (
        <circle
          cx={32}
          cy={CARD_H / 2}
          r={20.5}
          fill="none"
          stroke="#17A673"
          strokeWidth={2}
        />
      )}
      <text x={58} y={person.birthPlace ? 25 : 29} fontFamily={UI_FONT} fontSize={13.5} fontWeight={600} fill="#17211B">
        {name}
      </text>
      <text x={58} y={person.birthPlace ? 41 : 47} fontFamily={UI_FONT} fontSize={11} fill="#6B7469">
        {dates || 'dates inconnues'}
      </text>
      {place && (
        <text x={58} y={55} fontFamily={UI_FONT} fontSize={10.5} fill="#9AA396">
          {place}
        </text>
      )}
    </g>
  )
}
