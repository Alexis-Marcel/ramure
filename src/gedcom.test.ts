import { describe, expect, it } from 'vitest'
import { parseGedcom, serializeGedcom } from './gedcom'
import { sampleTree } from './data/sample'
import { computeLayout, CARD_H, CARD_W } from './layout'

describe('gedcom', () => {
  it('parse le fichier exemple', () => {
    const tree = sampleTree()
    expect(Object.keys(tree.persons)).toHaveLength(12)
    expect(Object.keys(tree.unions)).toHaveLength(4)
    const victor = tree.persons['@I1@']
    expect(victor.givenName).toBe('Victor')
    expect(victor.surname).toBe('Hugo')
    expect(victor.birthDate).toBe('26 février 1802')
    expect(victor.deathPlace).toBe('Paris')
    expect(victor.famc).toBe('@F1@')
    expect(victor.fams).toEqual(['@F4@'])
    expect(victor.notes).toContain('Misérables')
  })

  it('survit à un aller-retour export → import', () => {
    const tree = sampleTree()
    const roundtrip = parseGedcom(serializeGedcom(tree))
    expect(Object.keys(roundtrip.persons).sort()).toEqual(Object.keys(tree.persons).sort())
    expect(Object.keys(roundtrip.unions).sort()).toEqual(Object.keys(tree.unions).sort())
    for (const [id, p] of Object.entries(tree.persons)) {
      const q = roundtrip.persons[id]
      expect(q.givenName).toBe(p.givenName)
      expect(q.surname).toBe(p.surname)
      expect(q.birthDate).toBe(p.birthDate)
      expect(q.deathDate).toBe(p.deathDate)
      expect(q.famc).toBe(p.famc)
    }
    expect(roundtrip.unions['@F4@'].children).toEqual(tree.unions['@F4@'].children)
    expect(roundtrip.unions['@F4@'].marriageDate).toBe('12 octobre 1822')
  })

  it('ignore les lignes invalides sans planter', () => {
    const tree = parseGedcom('n importe quoi\n0 @I1@ INDI\n1 NAME Ada /Lovelace/\n???')
    expect(tree.persons['@I1@'].givenName).toBe('Ada')
  })
})

describe('layout', () => {
  it('place toutes les personnes reliées sans chevauchement', () => {
    const tree = sampleTree()
    const layout = computeLayout(tree, '@I1@')
    expect(layout.nodes).toHaveLength(12)
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]
        const b = layout.nodes[j]
        const overlap =
          a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H
        expect(overlap, `${a.person.id} chevauche ${b.person.id}`).toBe(false)
      }
    }
  })

  it('centre la personne de référence en (0,0)', () => {
    const layout = computeLayout(sampleTree(), '@I1@')
    const focal = layout.nodes.find((n) => n.isFocal)!
    expect(focal.x).toBe(-CARD_W / 2)
    expect(focal.y).toBe(0)
  })

  it('ne boucle pas sur un arbre vide ou un id inconnu', () => {
    expect(computeLayout({ persons: {}, unions: {} }, '@I1@').nodes).toHaveLength(0)
    expect(computeLayout(sampleTree(), '@ZZZ@').nodes).toHaveLength(0)
  })
})
