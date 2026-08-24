import type { Tree } from './types'

/** Tous les ascendants d'une personne (parents, grands-parents…). */
export function collectAncestors(tree: Tree, id: string): Set<string> {
  const out = new Set<string>()
  const walk = (cur: string) => {
    const famc = tree.persons[cur]?.famc
    if (!famc || !tree.unions[famc]) return
    for (const parent of tree.unions[famc].partners) {
      if (tree.persons[parent] && !out.has(parent)) {
        out.add(parent)
        walk(parent)
      }
    }
  }
  walk(id)
  return out
}

/** Tous les descendants d'une personne (enfants, petits-enfants…). */
export function collectDescendants(tree: Tree, id: string): Set<string> {
  const out = new Set<string>()
  const walk = (cur: string) => {
    for (const unionId of tree.persons[cur]?.fams ?? []) {
      for (const child of tree.unions[unionId]?.children ?? []) {
        if (tree.persons[child] && !out.has(child)) {
          out.add(child)
          walk(child)
        }
      }
    }
  }
  walk(id)
  return out
}
