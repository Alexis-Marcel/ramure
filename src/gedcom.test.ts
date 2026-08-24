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

  it('conserve séparations et divorces (DIV) à l’aller-retour', () => {
    const ged = `
0 @I1@ INDI
1 NAME A /X/
1 FAMS @F1@
0 @I2@ INDI
1 NAME B /Y/
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1990
1 DIV
2 DATE 2005
0 TRLR`
    const tree = parseGedcom(ged)
    expect(tree.unions['@F1@'].separated).toBe(true)
    expect(tree.unions['@F1@'].divorceDate).toBe('2005')
    const roundtrip = parseGedcom(serializeGedcom(tree))
    expect(roundtrip.unions['@F1@'].separated).toBe(true)
    expect(roundtrip.unions['@F1@'].divorceDate).toBe('2005')
  })

  it('lit et réécrit le nom d’usage (TYPE married et _MARNM)', () => {
    const ged = `
0 @I1@ INDI
1 NAME Camille /Dupont/
2 _MARNM Durand
0 @I2@ INDI
1 NAME Louise /Martin/
1 NAME Louise /Durand/
2 TYPE married
0 TRLR`
    const tree = parseGedcom(ged)
    expect(tree.persons['@I1@'].surname).toBe('Dupont')
    expect(tree.persons['@I1@'].marriedName).toBe('Durand')
    expect(tree.persons['@I2@'].surname).toBe('Martin')
    expect(tree.persons['@I2@'].marriedName).toBe('Durand')
    const roundtrip = parseGedcom(serializeGedcom(tree))
    expect(roundtrip.persons['@I1@'].marriedName).toBe('Durand')
    expect(roundtrip.persons['@I2@'].surname).toBe('Martin')
    expect(roundtrip.persons['@I2@'].marriedName).toBe('Durand')
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

  it('affiche les collatéraux : fratries, oncles et cousins', () => {
    // grands-parents → [père, oncle] ; oncle + tante → cousin ; parents → [focal, sœur]
    const ged = `
0 @I1@ INDI
1 NAME Focal /Test/
1 FAMC @F1@
0 @I2@ INDI
1 NAME Père /Test/
1 FAMC @F2@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Mère /Test/
1 FAMS @F1@
0 @I4@ INDI
1 NAME Sœur /Test/
1 FAMC @F1@
0 @I5@ INDI
1 NAME Grand-père /Test/
1 FAMS @F2@
0 @I6@ INDI
1 NAME Grand-mère /Test/
1 FAMS @F2@
0 @I7@ INDI
1 NAME Oncle /Test/
1 FAMC @F2@
1 FAMS @F3@
0 @I8@ INDI
1 NAME Tante /Test/
1 FAMS @F3@
0 @I9@ INDI
1 NAME Cousin /Test/
1 FAMC @F3@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 CHIL @I4@
0 @F2@ FAM
1 HUSB @I5@
1 WIFE @I6@
1 CHIL @I2@
1 CHIL @I7@
0 @F3@ FAM
1 HUSB @I7@
1 WIFE @I8@
1 CHIL @I9@
0 TRLR`
    const tree = parseGedcom(ged)
    const layout = computeLayout(tree, '@I1@')
    // tout l'arbre est visible depuis la personne de référence
    expect(layout.nodes).toHaveLength(9)
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]
        const b = layout.nodes[j]
        const overlap =
          a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H
        expect(overlap, `${a.person.id} chevauche ${b.person.id}`).toBe(false)
      }
    }
    // le cousin pend sous l'oncle, une génération sous les parents
    const uncle = layout.nodes.find((n) => n.person.id === '@I7@')!
    const cousin = layout.nodes.find((n) => n.person.id === '@I9@')!
    expect(uncle.y).toBeLessThan(cousin.y)
  })

  it('ne boucle pas sur un arbre vide ou un id inconnu', () => {
    expect(computeLayout({ persons: {}, unions: {} }, '@I1@').nodes).toHaveLength(0)
    expect(computeLayout(sampleTree(), '@ZZZ@').nodes).toHaveLength(0)
  })
})
