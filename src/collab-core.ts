import * as Y from 'yjs'
import type { Person, Tree, Union } from './types'
import { emptyTree } from './types'

/** Origine des transactions locales — permet d'ignorer nos propres échos. */
export const LOCAL_ORIGIN = 'ramure-local'

export function readTreeFrom(doc: Y.Doc): Tree {
  const yPersons = doc.getMap<Person>('persons')
  const yUnions = doc.getMap<Union>('unions')
  const tree = emptyTree()
  yPersons.forEach((p, id) => {
    tree.persons[id] = structuredClone(p)
  })
  yUnions.forEach((u, id) => {
    tree.unions[id] = structuredClone(u)
  })
  return tree
}

/** Écrit l'arbre dans le document en ne touchant que les entrées modifiées. */
export function writeTreeTo(doc: Y.Doc, tree: Tree) {
  const yPersons = doc.getMap<Person>('persons')
  const yUnions = doc.getMap<Union>('unions')
  doc.transact(() => {
    for (const [id, p] of Object.entries(tree.persons)) {
      const cur = yPersons.get(id)
      if (!cur || JSON.stringify(cur) !== JSON.stringify(p)) yPersons.set(id, structuredClone(p))
    }
    for (const id of [...yPersons.keys()]) {
      if (!tree.persons[id]) yPersons.delete(id)
    }
    for (const [id, u] of Object.entries(tree.unions)) {
      const cur = yUnions.get(id)
      if (!cur || JSON.stringify(cur) !== JSON.stringify(u)) yUnions.set(id, structuredClone(u))
    }
    for (const id of [...yUnions.keys()]) {
      if (!tree.unions[id]) yUnions.delete(id)
    }
  }, LOCAL_ORIGIN)
}
