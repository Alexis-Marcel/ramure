import { useCallback, useEffect, useRef, useState } from 'react'
import type { TreeLayout } from '../layout'
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

export function Canvas({ layout, focalId, selectedId, onSelect, onFocus }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vb, setVb] = useState<ViewBox>({ x: -600, y: -400, w: 1200, h: 800 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

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
          drag.current = { x: e.clientX, y: e.clientY, moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const rect = e.currentTarget.getBoundingClientRect()
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) > 2) {
            drag.current.moved = true
            // capturer seulement une fois le déplacement engagé : capturer dès le
            // pointerdown détournerait le click des fiches vers le SVG
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          if (!drag.current.moved) return
          setVb((v) => ({
            ...v,
            x: v.x - (dx / rect.width) * v.w,
            y: v.y - (dy / rect.height) * v.h,
          }))
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) onSelect(null)
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
