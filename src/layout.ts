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

/**
 * Emprise horizontale d'un bloc, rangée par rangée (génération par génération).
 * C'est ce qui permet d'imbriquer les branches collatérales sans chevauchement :
 * deux blocs peuvent se superposer horizontalement tant qu'ils n'occupent pas
 * les mêmes rangées.
 */
type Extents = Map<number, { min: number; max: number }>

function addExt(e: Extents, row: number, min: number, max: number) {
  const cur = e.get(row)
  if (!cur) e.set(row, { min, max })
  else {
    cur.min = Math.min(cur.min, min)
    cur.max = Math.max(cur.max, max)
  }
}

function shiftExt(e: Extents, dx: number): Extents {
  return new Map([...e].map(([r, i]) => [r, { min: i.min + dx, max: i.max + dx }]))
}

function mergeExt(into: Extents, from: Extents) {
  for (const [r, i] of from) addExt(into, r, i.min, i.max)
}

/** Décalage minimal à appliquer à `b` pour qu'il reste à droite de `a` avec `gap` sur leurs rangées communes. */
function packGap(a: Extents, b: Extents, gap: number): number {
  let dx = 0
  for (const [r, ib] of b) {
    const ia = a.get(r)
    if (ia && ib.min < ia.max + gap) dx = Math.max(dx, ia.max + gap - ib.min)
  }
  return dx
}

/**
 * Vue « sablier étendu » : ascendance et descendance de la personne de
 * référence, plus les branches collatérales — à chaque génération de la lignée
 * directe, les frères et sœurs sont affichés avec conjoints et descendants.
 * L'empaquetage par contours garantit l'absence de chevauchement.
 */
export function computeLayout(tree: Tree, focalId: string): TreeLayout {
  const nodes: LayoutNode[] = []
  const links: LayoutLink[] = []
  const focal = tree.persons[focalId]
  if (!focal) return { nodes, links, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }

  const addNode = (person: Person, cx: number, gen: number, isFocal = false) => {
    nodes.push({ person, x: cx - CARD_W / 2, y: rowY(gen), isFocal })
  }

  const partnerOf = (unionId: string, id: string): Person | undefined => {
    const other = tree.unions[unionId]?.partners.find((p) => p !== id)
    return other ? tree.persons[other] : undefined
  }

  const unionsOf = (id: string): string[] =>
    (tree.persons[id]?.fams ?? []).filter((u) => tree.unions[u])

  /** Largeur de la rangée de couple (fiche + partenaires côte à côte). */
  const coupleWOf = (id: string): number => {
    const partners = unionsOf(id).filter((u) => partnerOf(u, id)).length
    return CARD_W + partners * (COUPLE_GAP + CARD_W)
  }

  /** Abscisse du centre de la fiche quand le sous-arbre descendant est centré sur slotCx. */
  const cardCxInDescSlot = (id: string, slotCx: number): number =>
    slotCx - (coupleWOf(id) - CARD_W) / 2

  const parentsOf = (id: string): string[] => {
    const famc = tree.persons[id]?.famc
    return famc ? (tree.unions[famc]?.partners ?? []).filter((p) => tree.persons[p]) : []
  }

  // ----- Descendance (sous-arbre : personne, partenaires, enfants…) -----

  const descWidth = new Map<string, number>()
  const descW = (id: string, depth: number, visited: Set<string>): number => {
    const cached = descWidth.get(id)
    if (cached !== undefined) return cached
    if (depth > MAX_GEN || visited.has(id)) return CARD_W
    visited.add(id)
    const person = tree.persons[id]
    if (!person) return CARD_W
    const coupleW = coupleWOf(id)
    const blocks: number[] = []
    for (const unionId of unionsOf(id)) {
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

  const descDepthMemo = new Map<string, number>()
  const descDepth = (id: string, depth: number, visited: Set<string>): number => {
    const cached = descDepthMemo.get(id)
    if (cached !== undefined) return cached
    if (depth > MAX_GEN || visited.has(id)) return 0
    visited.add(id)
    let d = 0
    for (const unionId of unionsOf(id)) {
      for (const c of tree.unions[unionId].children.filter((c) => tree.persons[c])) {
        d = Math.max(d, 1 + descDepth(c, depth + 1, visited))
      }
    }
    visited.delete(id)
    descDepthMemo.set(id, d)
    return d
  }

  const placeDescendants = (
    id: string,
    cx: number,
    gen: number,
    visited: Set<string>,
    skipOwnCard: boolean,
  ) => {
    if (Math.abs(gen) >= MAX_GEN || visited.has(id)) return
    visited.add(id)
    const person = tree.persons[id]
    if (!person) return

    const unions = unionsOf(id)
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
        const widths = children.map((c) => descW(c, 0, new Set(visited)))
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
        links.push({
          d: stem(anchorX, anchorY, cardCxInDescSlot(childId, ccx), rowY(gen + 1)),
          kind: 'lineage',
        })
        placeDescendants(childId, ccx, gen + 1, visited, false)
        x0 += block.widths[i] + H_GAP
      })
      bx += block.w + GROUP_GAP
    }
  }

  // ----- Ascendance avec collatéraux (empaquetage par contours) -----

  interface AncBox {
    /** emprises relatives au point de référence (centre de la rangée d'enfants) */
    extents: Extents
    /** abscisse de la fiche de `id`, relative au point de référence */
    cardRel: number
    place: (refX: number) => void
  }

  /** side : -1 branche paternelle (gauche), 1 branche maternelle (droite), 0 centre */
  const buildAnc = (id: string, level: number, visited: Set<string>, side: -1 | 0 | 1): AncBox => {
    visited = new Set(visited)
    visited.add(id)

    // rangée : `id` et sa fratrie, chacun avec l'emprise de sa descendance.
    // La personne en lignée directe est placée du côté intérieur de sa fratrie
    // pour rester proche de son conjoint et de leurs enfants.
    const famc = tree.persons[id]?.famc
    const children =
      famc && tree.unions[famc] ? tree.unions[famc].children.filter((c) => tree.persons[c]) : []
    let rowIds = children.includes(id) ? children : [id]
    if (side !== 0 && rowIds.length > 1) {
      const sibs = rowIds.filter((c) => c !== id)
      rowIds = side === -1 ? [...sibs, id] : [id, ...sibs]
    }
    const items = rowIds.map((c) => {
      const w = c === id && level > 0 ? CARD_W : Math.max(CARD_W, descW(c, 0, new Set()))
      const depth = c === id && level > 0 ? 0 : descDepth(c, 0, new Set())
      const cardRelInSlot = c === id && level > 0 ? 0 : -(coupleWOf(c) - CARD_W) / 2
      return { id: c, w, depth, cardRelInSlot, self: c === id }
    })
    const rowW = items.reduce((acc, it) => acc + it.w, 0) + H_GAP * (items.length - 1)

    const extents: Extents = new Map()
    let cardRel = 0
    const slotRel: number[] = []
    let x = -rowW / 2
    for (const item of items) {
      const slotCx = x + item.w / 2
      slotRel.push(slotCx)
      for (let d = 0; d <= item.depth; d++) {
        addExt(extents, -level + d, slotCx - item.w / 2, slotCx + item.w / 2)
      }
      if (item.self) cardRel = slotCx + item.cardRelInSlot
      x += item.w + H_GAP
    }

    // parents au-dessus, imbriqués autour de la rangée sans collision
    const parents = level < MAX_GEN ? parentsOf(id).filter((p) => !visited.has(p)) : []
    const pBoxes = parents.map((p, i) =>
      buildAnc(p, level + 1, visited, parents.length === 1 ? side : i === 0 ? -1 : 1),
    )
    const pOffsets: number[] = pBoxes.map(() => 0)

    if (pBoxes.length === 1) {
      // parent centré au-dessus de la fiche, poussé de côté si sa branche déborde
      let X = cardRel - pBoxes[0].cardRel
      const shifted = () => shiftExt(pBoxes[0].extents, X)
      X += packGap(extents, shifted(), H_GAP)
      const back = packGap(shifted(), extents, H_GAP)
      if (back > 0) X -= back
      pOffsets[0] = X
    } else if (pBoxes.length >= 2) {
      const [f, m] = pBoxes
      // ancre (milieu des fiches des parents) alignée sur le centre de la rangée ;
      // la boucle écarte les deux blocs jusqu'à disparition des collisions
      let Xf = -f.cardRel
      let Xm = -m.cardRel
      for (let i = 0; i < 30; i++) {
        let moved = 0
        // le père reste à gauche de la mère
        const dfm = packGap(shiftExt(f.extents, Xf), shiftExt(m.extents, Xm), H_GAP)
        if (dfm > 0) {
          Xm += dfm
          moved += dfm
        }
        // la rangée d'enfants se glisse entre les branches qui pendent des deux côtés
        const dl = packGap(shiftExt(f.extents, Xf), extents, H_GAP)
        if (dl > 0) {
          Xf -= dl
          moved += dl
        }
        const dr = packGap(extents, shiftExt(m.extents, Xm), H_GAP)
        if (dr > 0) {
          Xm += dr
          moved += dr
        }
        // ré-alignement de l'ancre sur le centre de la rangée
        const a = (Xf + f.cardRel + Xm + m.cardRel) / 2
        Xf -= a
        Xm -= a
        if (moved === 0 && Math.abs(a) < 0.5) break
      }
      pOffsets[0] = Xf
      pOffsets[1] = Xm
    }

    const merged: Extents = new Map()
    mergeExt(merged, extents)
    pBoxes.forEach((b, i) => mergeExt(merged, shiftExt(b.extents, pOffsets[i])))

    const place = (refX: number) => {
      const childTops: number[] = []
      items.forEach((item, i) => {
        const slotAbs = refX + slotRel[i]
        if (item.self && level === 0) {
          // la fiche de la personne de référence est déjà posée ; on déroule sa descendance
          placeDescendants(id, slotAbs, 0, new Set(), true)
        } else if (item.self) {
          addNode(tree.persons[id], slotAbs, -level)
        } else {
          placeDescendants(item.id, slotAbs, -level, new Set([id]), false)
        }
        childTops.push(slotAbs + item.cardRelInSlot)
      })

      if (pBoxes.length > 0) {
        const parentCards = pBoxes.map((b, i) => refX + pOffsets[i] + b.cardRel)
        pBoxes.forEach((b, i) => b.place(refX + pOffsets[i]))
        const anchorX = parentCards.reduce((a, b) => a + b, 0) / parentCards.length
        const parentBottomY = rowY(-(level + 1)) + CARD_H
        const anchorY = parentBottomY + V_GAP * 0.45
        for (const pcx of parentCards) {
          links.push({ d: stem(pcx, parentBottomY, anchorX, anchorY), kind: 'lineage' })
        }
        const childTopY = rowY(-level)
        for (const tx of childTops) {
          links.push({ d: stem(anchorX, anchorY, tx, childTopY), kind: 'lineage' })
        }
      }
    }

    return { extents: merged, cardRel, place }
  }

  // La personne de référence est à (0,0) : on décale tout le bloc pour l'y amener.
  addNode(focal, 0, 0, true)
  const box = buildAnc(focalId, 0, new Set(), 0)
  box.place(-box.cardRel)

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
