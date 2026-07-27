'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Cutout, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import {
  dropOnClusterAction,
  moveObjectAction,
  scatterBoardAction,
  tidyBoardAction,
} from '@/server/actions/board'

type Item = {
  id: string
  lotNo: number
  title: string
  kind: string | null
  silhouette: string
  cutStyle: string
  rotationDeg: number
  cutoutUrl: string | null
  faceW: number | null
  faceH: number | null
  giver: string | null
  x: number
  y: number
  z: number
}

type Cluster = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  count: number
  impliedTags: string[]
}

type Viewport = { x: number; y: number; scale: number }

const VIEWPORT_KEY = 'capsule:board:viewport'

/**
 * The Board: one absolutely-positioned world layer under a single transform.
 *
 * Pan and zoom touch only that transform, so the browser never relayouts the
 * cutouts; drag touches only the dragged element's left/top, exactly as the
 * design doc's own script does it. Layout persists per object on drag end;
 * the viewport persists locally — where *you* were looking is device state,
 * not archive state.
 */
export function BoardCanvas({ items, clusters }: { items: Item[]; clusters: Cluster[] }) {
  const router = useRouter()
  const worldRef = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()

  const [viewport, setViewport] = useState<Viewport>(() => {
    // Lazy read, not an effect: the saved viewport is device state and there is
    // no reason to render a frame at the default first.
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(VIEWPORT_KEY)
        if (saved) return JSON.parse(saved) as Viewport
      } catch {}
    }
    return { x: 0, y: 0, scale: 0.62 }
  })
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(items.map((item) => [item.id, { x: item.x, y: item.y, z: item.z }])),
  )
  const [dragId, setDragId] = useState<string | null>(null)
  const [hoverCluster, setHoverCluster] = useState<string | null>(null)

  const saveViewport = (next: Viewport) => {
    setViewport(next)
    try {
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(next))
    } catch {}
  }

  const pan = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null)
  const drag = useRef<{
    id: string
    startX: number
    startY: number
    ox: number
    oy: number
  } | null>(null)

  function worldPoint(clientX: number, clientY: number) {
    return {
      x: (clientX - viewport.x) / viewport.scale,
      y: (clientY - viewport.y) / viewport.scale,
    }
  }

  function clusterAt(x: number, y: number) {
    return clusters.find(
      (c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h,
    )
  }

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onPointerDown={(event) => {
        const el = (event.target as Element).closest?.('[data-board-id]') as HTMLElement | null
        if (el) {
          const id = el.dataset.boardId!
          const pos = positions[id]!
          drag.current = {
            id,
            startX: event.clientX,
            startY: event.clientY,
            ox: pos.x,
            oy: pos.y,
          }
          setDragId(id)
          // Top of the pile while it travels.
          setPositions((p) => ({ ...p, [id]: { ...p[id]!, z: 999 } }))
        } else {
          pan.current = {
            startX: event.clientX,
            startY: event.clientY,
            vx: viewport.x,
            vy: viewport.y,
          }
        }
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (drag.current) {
          const { id, startX, startY, ox, oy } = drag.current
          const next = {
            x: ox + (event.clientX - startX) / viewport.scale,
            y: oy + (event.clientY - startY) / viewport.scale,
          }
          setPositions((p) => ({ ...p, [id]: { ...p[id]!, ...next } }))
          const point = worldPoint(event.clientX, event.clientY)
          setHoverCluster(clusterAt(point.x, point.y)?.id ?? null)
        } else if (pan.current) {
          const { startX, startY, vx, vy } = pan.current
          setViewport((v) => ({
            ...v,
            x: vx + event.clientX - startX,
            y: vy + event.clientY - startY,
          }))
        }
      }}
      onPointerUp={(event) => {
        if (drag.current) {
          const { id } = drag.current
          const pos = positions[id]!
          const point = worldPoint(event.clientX, event.clientY)
          const target = clusterAt(point.x, point.y)
          drag.current = null
          setDragId(null)
          setHoverCluster(null)
          startTransition(async () => {
            await moveObjectAction(id, Math.round(pos.x), Math.round(pos.y), Date.now() % 100000)
            if (target) {
              await dropOnClusterAction(id, target.id)
              router.refresh()
            }
          })
        }
        if (pan.current) {
          pan.current = null
          saveViewport(viewport)
        }
      }}
      onWheel={(event) => {
        // Zoom about the pointer so the spot under the cursor stays put.
        const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08
        const scale = Math.min(2, Math.max(0.25, viewport.scale * factor))
        const ratio = scale / viewport.scale
        saveViewport({
          scale,
          x: event.clientX - (event.clientX - viewport.x) * ratio,
          y: event.clientY - (event.clientY - viewport.y) * ratio,
        })
      }}
      style={{
        background: [
          'radial-gradient(120% 90% at 50% 0%, rgb(255 255 255 / 0.55), transparent 60%)',
          'repeating-linear-gradient(0deg, rgb(90 74 50 / 0.045) 0 1px, transparent 1px 26px)',
          'repeating-linear-gradient(90deg, rgb(90 74 50 / 0.045) 0 1px, transparent 1px 26px)',
        ].join(','),
      }}
    >
      <div
        ref={worldRef}
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {clusters.map((cluster) => (
          <div key={cluster.id}>
            <div
              className="absolute rounded-[16px] border border-dashed"
              style={{
                left: cluster.x,
                top: cluster.y,
                width: cluster.w,
                height: cluster.h,
                borderColor:
                  hoverCluster === cluster.id ? 'var(--accent)' : 'var(--hair-strong)',
                background:
                  hoverCluster === cluster.id
                    ? 'rgb(255 255 255 / 0.38)'
                    : 'rgb(255 255 255 / 0.22)',
              }}
            />
            <div
              className="mn absolute rounded-[5px] border border-hair-strong bg-panel px-2 py-1 text-[9px] tracking-[0.13em] uppercase"
              style={{ left: cluster.x + 14, top: cluster.y - 22, color: 'var(--mute-3)' }}
            >
              {cluster.name} · {cluster.count}
              {hoverCluster === cluster.id && cluster.impliedTags.length ? (
                <span style={{ color: 'var(--accent)' }}>
                  {' '}
                  → {cluster.impliedTags.join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        ))}

        {items.map((item) => {
          const pos = positions[item.id]!
          const aspect = aspectOf(item.faceW, item.faceH)
          const width = cutoutWidth(item.silhouette as Silhouette, aspect, { min: 72, max: 160 })
          const dragging = dragId === item.id
          return (
            <div
              key={item.id}
              data-board-id={item.id}
              className="absolute cursor-grab"
              style={{
                left: pos.x,
                top: pos.y,
                zIndex: pos.z,
                cursor: dragging ? 'grabbing' : 'grab',
              }}
            >
              <Cutout
                width={width}
                silhouette={item.silhouette as Silhouette}
                cut={item.cutStyle as CutStyle}
                rotate={item.rotationDeg}
                aspect={aspect}
                src={item.cutoutUrl ?? undefined}
                alt={item.title}
                label={item.cutoutUrl ? undefined : (item.kind ?? undefined)}
                state={dragging ? 'dragging' : 'idle'}
              />
            </div>
          )
        })}
      </div>

      <Toolbar
        total={items.length}
        scale={viewport.scale}
        onFit={() => saveViewport({ x: 0, y: 0, scale: 0.62 })}
        onTidy={() => startTransition(async () => tidyBoardAction())}
        onScatter={() => startTransition(async () => scatterBoardAction())}
      />
    </div>
  )
}

function Toolbar({
  total,
  scale,
  onFit,
  onTidy,
  onScatter,
}: {
  total: number
  scale: number
  onFit: () => void
  onTidy: () => void
  onScatter: () => void
}) {
  return (
    <>
      <div
        className="absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[12px] border border-hair-strong p-1.5"
        style={{
          background: 'color-mix(in srgb, var(--panel) 94%, transparent)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 22px rgb(var(--shadow-ink) / 0.14)',
        }}
      >
        <span className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] font-semibold tracking-[-0.01em]">
          Everything <span className="mn text-[9px]" style={{ color: 'var(--mute-3)' }}>{total}</span>
        </span>
        <span className="h-5 w-px bg-hair-strong" />
        <button onClick={onScatter} className="mn rounded-lg px-2.5 py-2 text-[9px] tracking-[0.08em]" style={{ color: 'var(--mute-2)' }}>
          SCATTER
        </button>
        <button onClick={onTidy} className="mn rounded-lg px-2.5 py-2 text-[9px] tracking-[0.08em]" style={{ color: 'var(--mute-2)' }}>
          TIDY
        </button>
        <span className="h-5 w-px bg-hair-strong" />
        <Link href="/accession" className="mn rounded-lg bg-ink px-3 py-2 text-[9px] font-medium tracking-[0.08em] text-bg">
          + ADD
        </Link>
      </div>

      <button
        onClick={onFit}
        className="mn absolute right-5 bottom-5 flex items-center gap-2 rounded-[10px] border border-hair-strong px-3 py-2 text-[9px] tracking-[0.08em]"
        style={{
          background: 'color-mix(in srgb, var(--panel) 94%, transparent)',
          color: 'var(--mute-2)',
          boxShadow: '0 8px 22px rgb(var(--shadow-ink) / 0.12)',
        }}
      >
        {Math.round(scale * 100)}% <span className="h-3.5 w-px bg-hair-strong" /> FIT
      </button>
    </>
  )
}
