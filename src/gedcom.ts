import type { Person, Sex, Tree, Union } from './types'
import { emptyTree } from './types'

interface Line {
  level: number
  xref?: string
  tag: string
  value: string
}

function parseLines(text: string): Line[] {
  const lines: Line[] = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/)
    if (!m) continue
    lines.push({ level: Number(m[1]), xref: m[2], tag: m[3], value: m[4] ?? '' })
  }
  return lines
}

function parseName(value: string): { givenName: string; surname: string } {
  const m = value.match(/^([^/]*)(?:\/([^/]*)\/)?\s*(.*)$/)
  if (!m) return { givenName: value.trim(), surname: '' }
  const given = `${m[1] ?? ''} ${m[3] ?? ''}`.replace(/\s+/g, ' ').trim()
  return { givenName: given, surname: (m[2] ?? '').trim() }
}

export function parseGedcom(text: string): Tree {
  const lines = parseLines(text)
  const tree = emptyTree()

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.level !== 0) {
      i++
      continue
    }
    const end = (() => {
      let j = i + 1
      while (j < lines.length && lines[j].level > 0) j++
      return j
    })()
    const record = lines.slice(i + 1, end)

    if (line.tag === 'INDI' && line.xref) {
      const p: Person = { id: line.xref, givenName: '', surname: '', sex: 'U', fams: [] }
      let context: 'BIRT' | 'DEAT' | null = null
      let noteLines: string[] = []
      for (const l of record) {
        if (l.level === 1) {
          context = null
          switch (l.tag) {
            case 'NAME': {
              const { givenName, surname } = parseName(l.value)
              if (!p.givenName && !p.surname) {
                p.givenName = givenName
                p.surname = surname
              }
              break
            }
            case 'SEX':
              p.sex = l.value === 'M' || l.value === 'F' ? (l.value as Sex) : 'U'
              break
            case 'BIRT':
              context = 'BIRT'
              break
            case 'DEAT':
              context = 'DEAT'
              break
            case 'FAMC':
              p.famc = l.value
              break
            case 'FAMS':
              p.fams.push(l.value)
              break
            case 'NOTE':
              noteLines.push(l.value)
              break
          }
        } else if (l.level === 2) {
          if (context === 'BIRT') {
            if (l.tag === 'DATE') p.birthDate = l.value
            if (l.tag === 'PLAC') p.birthPlace = l.value
          } else if (context === 'DEAT') {
            if (l.tag === 'DATE') p.deathDate = l.value
            if (l.tag === 'PLAC') p.deathPlace = l.value
          }
          if (l.tag === 'CONT') noteLines.push(l.value)
          if (l.tag === 'CONC' && noteLines.length > 0) {
            noteLines[noteLines.length - 1] += l.value
          }
        }
      }
      if (noteLines.length > 0) p.notes = noteLines.join('\n')
      tree.persons[p.id] = p
    }

    if (line.tag === 'FAM' && line.xref) {
      const u: Union = { id: line.xref, partners: [], children: [] }
      let inMarr = false
      for (const l of record) {
        if (l.level === 1) {
          inMarr = false
          switch (l.tag) {
            case 'HUSB':
            case 'WIFE':
              u.partners.push(l.value)
              break
            case 'CHIL':
              u.children.push(l.value)
              break
            case 'MARR':
              inMarr = true
              break
          }
        } else if (l.level === 2 && inMarr) {
          if (l.tag === 'DATE') u.marriageDate = l.value
          if (l.tag === 'PLAC') u.marriagePlace = l.value
        }
      }
      tree.unions[u.id] = u
    }

    i = end
  }

  reconcile(tree)
  return tree
}

/** Rétablit la cohérence des références croisées personnes ↔ unions. */
export function reconcile(tree: Tree): void {
  for (const p of Object.values(tree.persons)) {
    p.fams = p.fams.filter((id) => tree.unions[id]?.partners.includes(p.id))
    if (p.famc && !tree.unions[p.famc]?.children.includes(p.id)) p.famc = undefined
  }
  for (const u of Object.values(tree.unions)) {
    u.partners = u.partners.filter((id) => tree.persons[id])
    u.children = u.children.filter((id) => tree.persons[id])
    for (const id of u.partners) {
      const p = tree.persons[id]
      if (!p.fams.includes(u.id)) p.fams.push(u.id)
    }
    for (const id of u.children) {
      tree.persons[id].famc = u.id
    }
  }
}

export function serializeGedcom(tree: Tree): string {
  const out: string[] = ['0 HEAD', '1 SOUR Ramure', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8']
  for (const p of Object.values(tree.persons)) {
    out.push(`0 ${p.id} INDI`)
    out.push(`1 NAME ${p.givenName} /${p.surname}/`)
    if (p.sex !== 'U') out.push(`1 SEX ${p.sex}`)
    if (p.birthDate || p.birthPlace) {
      out.push('1 BIRT')
      if (p.birthDate) out.push(`2 DATE ${p.birthDate}`)
      if (p.birthPlace) out.push(`2 PLAC ${p.birthPlace}`)
    }
    if (p.deathDate || p.deathPlace) {
      out.push('1 DEAT')
      if (p.deathDate) out.push(`2 DATE ${p.deathDate}`)
      if (p.deathPlace) out.push(`2 PLAC ${p.deathPlace}`)
    }
    if (p.famc) out.push(`1 FAMC ${p.famc}`)
    for (const f of p.fams) out.push(`1 FAMS ${f}`)
    if (p.notes) {
      const [first, ...rest] = p.notes.split('\n')
      out.push(`1 NOTE ${first}`)
      for (const r of rest) out.push(`2 CONT ${r}`)
    }
  }
  for (const u of Object.values(tree.unions)) {
    out.push(`0 ${u.id} FAM`)
    const [a, b] = u.partners
    const husb = [a, b].find((id) => id && tree.persons[id]?.sex === 'M') ?? a
    const wife = [a, b].find((id) => id && id !== husb) ?? undefined
    if (husb) out.push(`1 HUSB ${husb}`)
    if (wife) out.push(`1 WIFE ${wife}`)
    for (const c of u.children) out.push(`1 CHIL ${c}`)
    if (u.marriageDate || u.marriagePlace) {
      out.push('1 MARR')
      if (u.marriageDate) out.push(`2 DATE ${u.marriageDate}`)
      if (u.marriagePlace) out.push(`2 PLAC ${u.marriagePlace}`)
    }
  }
  out.push('0 TRLR')
  return out.join('\n')
}
