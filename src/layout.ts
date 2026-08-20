import type { Person, Tree } from './types'

export const CARD_W = 190
export const CARD_H = 68
export const H_GAP = 28
export const V_GAP = 110
export const COUPLE_GAP = 14
const GROUP_GAP = H_GAP * 2
const MAX_GEN = 25

export interface LayoutNode {
  person: Person
  /** coin haut-gauche de la fiche */
  x: number
  y: number
  isFocal: boolean
}

export interface LayoutLink {
  /** chemin SVG de la tige */
  d: string
  kind: 'lineage' | 'union'
}

export interface TreeLayout {
  nodes: LayoutNode[]
  links: LayoutLink[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const rowY = (gen: number) => gen * (CARD_H + V_GAP)

/** Tige organique verticale entre deux points (du haut d'une fiche vers le bas d'une autre). */
function stem(x1: number, y1: number, x2: number, y2: number): string {
  const dy = (y2 - y1) * 0.55
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
}

export function computeLayout(tree: Tree, focalId: string): TreeLayout {
  const nodes: LayoutNode[] = []
  const links: LayoutLink[] = []
  const focal = tree.persons[focalId]
  if (!focal) return { nodes, links, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }

  const addNode = (person: Person, cx: number, gen: number, isFocal = false) => {
    nodes.push({ person, x: cx - CARD_W / 2, y: rowY(gen), isFocal })
  }

  // ----- Ascendants -----
  const ancWidth = new Map<string, number>()
  const ancW = (id: string, depth: number, visited: Set<string>): number => {
    const cached = ancWidth.get(id)
    if (cached !== undefined) return cached
    if (depth > MAX_GEN || visited.has(id)) return CARD_W
    visited.add(id)
    const famc = tree.persons[id]?.famc
    const parents = famc ? (tree.unions[famc]?.partners ?? []).filter((p) => tree.persons[p]) : []
    let w = CARD_W
    if (parents.length > 0) {
      const sum = parents.reduce((acc, p) => acc + ancW(p, depth + 1, visited), 0)
      w = Math.max(CARD_W, sum + H_GAP * (parents.length - 1))
    }
    visited.delete(id)
    ancWidth.set(id, w)
    return w
  }

  const placeAncestors = (id: string, cx: number, gen: number, visited: Set<string>) => {
    if (gen >= MAX_GEN || visited.has(id)) return
    visited.add(id)
    const person = tree.persons[id]
    if (!person) return
    if (gen > 0) addNode(person, cx, -gen)
    const famc = person.famc
    const parents = famc ? (tree.unions[famc]?.partners ?? []).filter((p) => tree.persons[p]) : []
    if (parents.length === 0) return
    const total =
      parents.reduce((acc, p) => acc + ancW(p, gen + 1, new Set(visited)), 0) +
      H_GAP * (parents.length - 1)
    let x0 = cx - total / 2
    for (const parentId of parents) {
      const w = ancW(parentId, gen + 1, new Set(visited))
      const pcx = x0 + w / 2
      // tige : du bas du parent vers le haut de l'enfant
      links.push({ d: stem(pcx, rowY(-(gen + 1)) + CARD_H, cx, rowY(-gen)), kind: 'lineage' })
      placeAncestors(parentId, pcx, gen + 1, visited)
      x0 += w + H_GAP
    }
  }

  // ----- Descendants -----
  const partnerOf = (unionId: string, id: string): Person | undefined => {
    const other = tree.unions[unionId]?.partners.find((p) => p !== id)
    return other ? tree.persons[other] : undefined
  }

  const descWidth = new Map<string, number>()
  const descW = (id: string, depth: number, visited: Set<string>): number => {
    const cached = descWidth.get(id)
    if (cached !== undefined) return cached
    if (depth > MAX_GEN || visited.has(id)) return CARD_W
    visited.add(id)
    const person = tree.persons[id]
    if (!person) return CARD_W
    const unions = person.fams.filter((u) => tree.unions[u])
    let coupleW = CARD_W
    const blocks: number[] = []
    for (const unionId of unions) {
      if (partnerOf(unionId, id)) coupleW += COUPLE_GAP + CARD_W
      const children = tree.unions[unionId].children.filter((c) => tree.persons[c])
      if (children.length > 0) {
        const sum = children.reduce((acc, c) => acc + descW(c, depth + 1, visited), 0)
        blocks.push(sum + H_GAP * (children.length - 1))
      }
    }
    visited.delete(id)
    const childrenW =
      blocks.length > 0 ? blocks.reduce((a, b) => a + b, 0) + GROUP_GAP * (blocks.length - 1) : 0
    const w = Math.max(coupleW, childrenW)
    descWidth.set(id, w)
    return w
  }

  const placeDescendants = (
    id: string,
    cx: number,
    gen: number,
    visited: Set<string>,
    skipOwnCard: boolean,
  ) => {
    if (gen >= MAX_GEN || visited.has(id)) return
    visited.add(id)
    const person = tree.persons[id]
    if (!person) return

    const unions = person.fams.filter((u) => tree.unions[u])
    const partners = unions
      .map((u) => ({ unionId: u, partner: partnerOf(u, id) }))
      .filter((x): x is { unionId: string; partner: Person } => Boolean(x.partner))
    const coupleW = CARD_W + partners.length * (COUPLE_GAP + CARD_W)

    // rangée du couple, centrée sur cx
    let rowX = cx - coupleW / 2
    const selfCx = rowX + CARD_W / 2
    if (!skipOwnCard) addNode(person, selfCx, gen)
    rowX += CARD_W + COUPLE_GAP
    const partnerCx = new Map<string, number>()
    let prevCx = selfCx
    for (const { unionId, partner } of partners) {
      const pcx = rowX + CARD_W / 2
      addNode(partner, pcx, gen)
      partnerCx.set(unionId, pcx)
      const y = rowY(gen) + CARD_H / 2
      links.push({
        d: `M ${prevCx + CARD_W / 2} ${y} L ${pcx - CARD_W / 2} ${y}`,
        kind: 'union',
      })
      prevCx = pcx
      rowX += CARD_W + COUPLE_GAP
    }

    // blocs d'enfants, centrés sur cx
    const blocks = unions
      .map((unionId) => {
        const children = tree.unions[unionId].children.filter((c) => tree.persons[c])
        if (children.length === 0) return null
        const widths = children.map((c) => descW(c, gen + 1, new Set(visited)))
        const w = widths.reduce((a, b) => a + b, 0) + H_GAP * (children.length - 1)
        return { unionId, children, widths, w }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)

    const childrenW =
      blocks.length > 0
        ? blocks.reduce((acc, b) => acc + b.w, 0) + GROUP_GAP * (blocks.length - 1)
        : 0
    let bx = cx - childrenW / 2
    for (const block of blocks) {
      const px = partnerCx.get(block.unionId)
      const anchorX = px !== undefined ? (selfCx + px) / 2 : selfCx
      const anchorY = rowY(gen) + CARD_H
      let x0 = bx
      block.children.forEach((childId, i) => {
        const ccx = x0 + block.widths[i] / 2
        links.push({ d: stem(anchorX, anchorY, ccx, rowY(gen + 1)), kind: 'lineage' })
        placeDescendants(childId, ccx, gen + 1, visited, false)
        x0 += block.widths[i] + H_GAP
      })
      bx += block.w + GROUP_GAP
    }
  }

  // Le point focal est à (0,0) ; les ascendants sont centrés sur lui,
  // les partenaires s'étendent à sa droite, les enfants sous le couple.
  addNode(focal, 0, 0, true)
  placeAncestors(focalId, 0, 0, new Set())

  const focalPartners = focal.fams.filter((u) => tree.unions[u] && partnerOf(u, focalId))
  const coupleW = CARD_W + focalPartners.length * (COUPLE_GAP + CARD_W)
  // centre du sous-arbre descendant tel que la fiche focale reste à x=0
  const descCx = (coupleW - CARD_W) / 2
  placeDescendants(focalId, descCx, 0, new Set(), true)

  const bounds = nodes.reduce(
    (b, n) => ({
      minX: Math.min(b.minX, n.x),
      minY: Math.min(b.minY, n.y),
      maxX: Math.max(b.maxX, n.x + CARD_W),
      maxY: Math.max(b.maxY, n.y + CARD_H),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )

  return { nodes, links, bounds }
}
