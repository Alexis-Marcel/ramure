import { describe, expect, it } from 'vitest'
import { collectAncestors, collectDescendants } from './relatives'
import { sampleTree } from './data/sample'

describe('relatives', () => {
  it('remonte tous les ascendants', () => {
    const anc = collectAncestors(sampleTree(), '@I1@')
    // parents + les deux couples de grands-parents
    expect(anc).toEqual(new Set(['@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@']))
  })

  it('descend tous les descendants', () => {
    const desc = collectDescendants(sampleTree(), '@I2@')
    // Victor puis ses quatre enfants
    expect(desc).toEqual(new Set(['@I1@', '@I9@', '@I10@', '@I11@', '@I12@']))
  })

  it('renvoie des ensembles vides aux extrémités', () => {
    const tree = sampleTree()
    expect(collectAncestors(tree, '@I4@').size).toBe(0)
    expect(collectDescendants(tree, '@I9@').size).toBe(0)
  })
})
