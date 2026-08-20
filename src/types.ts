export type Sex = 'M' | 'F' | 'U'

export interface Person {
  id: string
  givenName: string
  surname: string
  sex: Sex
  birthDate?: string
  birthPlace?: string
  deathDate?: string
  deathPlace?: string
  notes?: string
  /** Union dont cette personne est l'enfant */
  famc?: string
  /** Unions dont cette personne est partenaire */
  fams: string[]
}

export interface Union {
  id: string
  partners: string[]
  children: string[]
  marriageDate?: string
  marriagePlace?: string
}

export interface Tree {
  persons: Record<string, Person>
  unions: Record<string, Union>
}

export function emptyTree(): Tree {
  return { persons: {}, unions: {} }
}

export function fullName(p: Person): string {
  const name = `${p.givenName} ${p.surname}`.trim()
  return name || 'Sans nom'
}

export function lifespan(p: Person): string {
  const b = p.birthDate?.trim()
  const d = p.deathDate?.trim()
  if (!b && !d) return ''
  return `${b ?? '…'} – ${d ?? ''}`
}
