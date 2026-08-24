import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { readTreeFrom, writeTreeTo } from './collab-core'
import { sampleTree } from './data/sample'

describe('collab-core', () => {
  it('écrit puis relit un arbre à l’identique', () => {
    const doc = new Y.Doc()
    const tree = sampleTree()
    writeTreeTo(doc, tree)
    expect(readTreeFrom(doc)).toEqual(tree)
  })

  it('synchronise deux documents via leurs updates', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    writeTreeTo(a, sampleTree())
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(readTreeFrom(b)).toEqual(readTreeFrom(a))
  })

  it('fusionne des modifications concurrentes sur des personnes différentes', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    writeTreeTo(a, sampleTree())
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    // chacun modifie de son côté, hors-ligne
    const treeA = readTreeFrom(a)
    treeA.persons['@I1@'].notes = 'modifié par A'
    writeTreeTo(a, treeA)

    const treeB = readTreeFrom(b)
    treeB.persons['@I8@'].birthPlace = 'modifié par B'
    writeTreeTo(b, treeB)

    // échange des updates dans les deux sens
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

    const merged = readTreeFrom(a)
    expect(merged.persons['@I1@'].notes).toBe('modifié par A')
    expect(merged.persons['@I8@'].birthPlace).toBe('modifié par B')
    expect(readTreeFrom(b)).toEqual(merged)
  })

  it('propage les suppressions', () => {
    const doc = new Y.Doc()
    const tree = sampleTree()
    writeTreeTo(doc, tree)
    delete tree.persons['@I12@']
    writeTreeTo(doc, tree)
    expect(readTreeFrom(doc).persons['@I12@']).toBeUndefined()
  })
})
