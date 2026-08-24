import { useCallback, useEffect, useRef, useState } from 'react'
import type { TreeLayout } from '../layout'
import type { CardActions } from './PersonCard'
import { TreeSvg } from './TreeSvg'

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  layout: TreeLayout
  focalId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onFocus: (id: string) => void
  actions: CardActions
}

function fitViewBox(layout: TreeLayout, aspect: number): ViewBox {
  const m = 80
  const { minX, minY, maxX, maxY } = layout.bounds
  let w = maxX - minX + m * 2
  let h = maxY - minY + m * 2
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export function Canvas({ layout, focalId, selectedId, onSelect, onFocus, actions }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vb, setVb] = useState<ViewBox>({ x: -600, y: -400, w: 1200, h: 800 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number } | null>(null)

  const fit = useCallback(() => {
    const svg = svgRef.current
    if (!svg || layout.nodes.length === 0) return
    const rect = svg.getBoundingClientRect()
    setVb(fitViewBox(layout, rect.width / rect.height))
  }, [layout])

  // recadre à chaque changement de personne de référence
  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focalId, layout.nodes.length === 0])

  // recadre quand l'écran change de taille (rotation d'un téléphone…)
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = clientX === undefined ? vb.x + vb.w / 2 : vb.x + ((clientX - rect.left) / rect.width) * vb.w
    const py = clientY === undefined ? vb.y + vb.h / 2 : vb.y + ((clientY - rect.top) / rect.height) * vb.h
    setVb((v) => {
      const w = Math.min(50000, Math.max(200, v.w * factor))
      const scale = w / v.w
      return { x: px - (px - v.x) * scale, y: py - (py - v.y) * scale, w, h: v.h * scale }
    })
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(Math.exp(e.deltaY * 0.002), e.clientX, e.clientY)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vb])

  return (
    <div className="canvas">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.current.size === 2) {
            // début de pincement : deux doigts posés
            const [a, b] = [...pointers.current.values()]
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
            drag.current = null
            try {
              for (const id of pointers.current.keys()) e.currentTarget.setPointerCapture(id)
            } catch {
              // certains navigateurs refusent la capture : le pincement marche sans
            }
          } else if (pointers.current.size === 1) {
            drag.current = { x: e.clientX, y: e.clientY, moved: false }
          }
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) {
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          }
          if (pinch.current && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()]
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            if (dist > 0) {
              zoomAt(pinch.current.dist / dist, (a.x + b.x) / 2, (a.y + b.y) / 2)
              pinch.current.dist = dist
            }
            return
          }
          if (!drag.current) return
          const rect = e.currentTarget.getBoundingClientRect()
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) > 2) {
            drag.current.moved = true
            // capturer seulement une fois le déplacement engagé : capturer dès le
            // pointerdown détournerait le click des fiches vers le SVG
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // capture refusée : le déplacement reste possible tant que le pointeur est sur le SVG
            }
          }
          if (!drag.current.moved) return
          setVb((v) => ({
            ...v,
            x: v.x - (dx / rect.width) * v.w,
            y: v.y - (dy / rect.height) * v.h,
          }))
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId)
          if (pinch.current) {
            if (pointers.current.size < 2) pinch.current = null
            return
          }
          if (drag.current && !drag.current.moved) onSelect(null)
          drag.current = null
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId)
          if (pointers.current.size < 2) pinch.current = null
          drag.current = null
        }}
      >
        <defs>
          <pattern id="dotgrid" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#E2E7E1" />
          </pattern>
        </defs>
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.w}
          height={vb.h}
          fill="url(#dotgrid)"
          pointerEvents="none"
        />
        <TreeSvg
          layout={layout}
          selectedId={selectedId}
          onSelect={onSelect}
          onFocus={onFocus}
          actions={actions}
        />
      </svg>
      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button onClick={() => zoomAt(1 / 1.3)} aria-label="Zoomer" title="Zoomer">
          +
        </button>
        <button onClick={() => zoomAt(1.3)} aria-label="Dézoomer" title="Dézoomer">
          −
        </button>
        <button onClick={fit} aria-label="Recentrer l'arbre" title="Recentrer">
          ⌂
        </button>
      </div>
    </div>
  )
}
