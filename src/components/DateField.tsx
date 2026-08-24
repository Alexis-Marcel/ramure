import { useEffect, useRef, useState } from 'react'

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

interface Parts {
  day: string
  month: string
  year: string
}

/** Lit une date française « 26 février 1802 », « février 1802 » ou « 1802 ». */
function parseParts(value: string): Parts | null {
  const t = value.trim()
  if (!t) return { day: '', month: '', year: '' }
  const m = t.match(/^(?:(\d{1,2})\s+)?(?:([a-zà-ÿ]+)\s+)?(\d{3,4})$/i)
  if (!m) return null
  let month = ''
  if (m[2]) {
    const idx = MONTHS.indexOf(m[2].toLowerCase())
    if (idx === -1) return null
    month = String(idx + 1)
  }
  if (m[1] && !month) return null
  return { day: m[1] ?? '', month, year: m[3] }
}

/** N'émet une date que lorsque l'année est complète (3 ou 4 chiffres). */
function formatParts({ day, month, year }: Parts): string {
  if (!/^\d{3,4}$/.test(year)) return ''
  const monthName = month ? MONTHS[Number(month) - 1] : ''
  return [monthName && day ? day : '', monthName, year].filter(Boolean).join(' ')
}

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
}

/**
 * Date généalogique : jour, mois et année séparés, tous optionnels sauf
 * l'année — on connaît rarement une date complète. Une valeur existante non
 * reconnue (« vers 1780 »…) reste éditable en texte libre.
 *
 * L'état vit dans le composant pendant la saisie : la valeur émise (souvent
 * incomplète au fil des frappes) ne re-pilote pas l'affichage. Seule une
 * modification venue d'ailleurs (autre fiche, synchronisation) resynchronise.
 */
export function DateField({ label, value, onChange }: Props) {
  const lastEmitted = useRef<string | null>(null)
  const [parts, setParts] = useState<Parts | null>(() => parseParts(value))

  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = null
    setParts(parseParts(value))
  }, [value])

  const emitParts = (next: Parts) => {
    setParts(next)
    const out = formatParts(next)
    lastEmitted.current = out
    onChange(out)
  }

  if (parts === null) {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => {
            lastEmitted.current = e.target.value
            onChange(e.target.value)
          }}
          onBlur={() => {
            const p = parseParts(value)
            if (p !== null) setParts(p)
          }}
          placeholder="vers 1780…"
        />
      </label>
    )
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="date-field">
        <input
          className="date-day"
          inputMode="numeric"
          placeholder="JJ"
          maxLength={2}
          aria-label={`${label} — jour`}
          value={parts.day}
          disabled={!parts.month}
          onChange={(e) => emitParts({ ...parts, day: e.target.value.replace(/\D/g, '') })}
        />
        <select
          className="date-month"
          aria-label={`${label} — mois`}
          value={parts.month}
          disabled={!parts.year}
          onChange={(e) =>
            emitParts({ ...parts, month: e.target.value, day: e.target.value ? parts.day : '' })
          }
        >
          <option value="">mois —</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="date-year"
          inputMode="numeric"
          placeholder="AAAA"
          maxLength={4}
          aria-label={`${label} — année`}
          value={parts.year}
          onChange={(e) => {
            const year = e.target.value.replace(/\D/g, '')
            emitParts({ ...parts, year, month: year ? parts.month : '', day: year ? parts.day : '' })
          }}
        />
      </div>
    </div>
  )
}
