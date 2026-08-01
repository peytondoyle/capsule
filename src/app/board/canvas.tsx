'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Cutout, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import type { DatePrecision } from '@/lib/format'
import {
  clusterByAction,
  dropOnClusterAction,
  moveObjectAction,
  scatterBoardAction,
  tidyBoardAction,
} from '@/server/actions/board'
import {
  FILTER_GROUPS,
  FilterRail,
  emptySelection,
  toggled,
  type Facets,
  type FilterGroup,
  type FilterSelection,
} from './filter-rail'
import { BoardSheet } from './sheet'

type Item = {
  id: string
  lotNo: number
  title: string
  kind: string | null
  silhouette: string
  cutStyle: string
  rotationDeg: number
  cutoutUrl: string | null
  thumbUrl: string | null
  faceW: number | null
  faceH: number | null
  giver: string | null
  placeName: string | null
  receivedAt: string | null
  receivedPrecision: DatePrecision
  story: string | null
  tags: string[]
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
  /**
   * Drag overrides, not a copy of the board.
   *
   * The server's coordinates are the truth; this only holds the one card
   * currently under the finger, so it tracks the pointer instead of waiting on
   * a round trip. Seeding state from props once instead meant TIDY, SCATTER and
   * CLUSTER BY all appeared to do nothing — their new coordinates arrived in
   * props that state ignored — and a newly accessioned object had no entry at
   * all, which threw on render.
   *
   * Each override remembers the server value it was taken against, so when a
   * revalidate delivers different coordinates the override is simply no longer
   * current and drops out. No effect, no reconciliation pass.
   */
  type Point = { x: number; y: number; z: number }
  const [moved, setMoved] = useState<Record<string, { base: Point; pos: Point }>>({})
  const positions: Record<string, Point> = Object.fromEntries(
    items.map((item) => {
      const server = { x: item.x, y: item.y, z: item.z }
      const override = moved[item.id]
      const current =
        override &&
        override.base.x === server.x &&
        override.base.y === server.y &&
        override.base.z === server.z
      return [item.id, current ? override.pos : server]
    }),
  )
  const setPositions = (update: (current: Record<string, Point>) => Record<string, Point>) =>
    setMoved(() => {
      const next = update(positions)
      const bases = new Map(items.map((item) => [item.id, { x: item.x, y: item.y, z: item.z }]))
      return Object.fromEntries(
        Object.entries(next).flatMap(([id, pos]) => {
          const base = bases.get(id)
          if (!base) return []
          const same = base.x === pos.x && base.y === pos.y && base.z === pos.z
          return same ? [] : [[id, { base, pos }] as const]
        }),
      )
    })
  const [dragId, setDragId] = useState<string | null>(null)
  const [hoverCluster, setHoverCluster] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [peeledId, setPeeledId] = useState<string | null>(null)
  // The same "is this a phone" test TiltLayer uses. Once per mount is right:
  // a pointer type does not change mid-session, and re-checking per event
  // would make a tap mean different things frames apart.
  const [coarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )

  const [filters, setFilters] = useState<FilterSelection>(emptySelection)
  const facetOf = (item: Item): Record<FilterGroup, string | null> => ({
    people: item.giver,
    places: item.placeName,
    years: item.receivedAt ? item.receivedAt.slice(0, 4) : 'undated',
    kinds: item.kind,
  })
  const visibleItems = items.filter((item) => {
    const values = facetOf(item)
    return FILTER_GROUPS.every(({ key }) => {
      const picked = filters[key]
      if (picked.size === 0) return true
      const value = values[key]
      return value !== null && picked.has(value)
    })
  })
  const facets: Facets = (() => {
    const counts: Record<FilterGroup, Map<string, number>> = {
      people: new Map(),
      places: new Map(),
      years: new Map(),
      kinds: new Map(),
    }
    for (const item of items) {
      const values = facetOf(item)
      for (const { key } of FILTER_GROUPS) {
        const value = values[key]
        if (value !== null) counts[key].set(value, (counts[key].get(value) ?? 0) + 1)
      }
    }
    const byCount = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0])
    // Years read as a timeline, newest first; the undated pile goes last.
    const byYear = (a: [string, number], b: [string, number]) =>
      a[0] === 'undated' ? 1 : b[0] === 'undated' ? -1 : b[0].localeCompare(a[0])
    return Object.fromEntries(
      FILTER_GROUPS.map(({ key }) => [
        key,
        [...counts[key].entries()]
          .sort(key === 'years' ? byYear : byCount)
          .map(([value, count]) => ({ value, count })),
      ]),
    ) as Facets
  })()

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
    z: number
  } | null>(null)

  /**
   * The next stacking value: one above everything currently on the board.
   *
   * The local override and the value sent to the server have to be the SAME
   * number. A constant sentinel (z: 999 locally, `Date.now() % 100000`
   * persisted) meant the second drag tied with the first — so a card could land
   * behind the pile it was dropped on — and it also guaranteed the override
   * never matched what the server stored, so it could never retire.
   */
  function nextZ() {
    return Math.max(0, ...Object.values(positions).map((p) => p.z)) + 1
  }

  /** Abandons the in-flight drag and returns the card to the server's truth. */
  function cancelDrag() {
    const active = drag.current
    drag.current = null
    setDragId(null)
    setHoverCluster(null)
    if (active) setMoved(({ [active.id]: _dropped, ...rest }) => rest)
  }

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

  const sheetObject = sheetId ? (items.find((item) => item.id === sheetId) ?? null) : null

  return (
    <>
    <div
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onPointerDown={(event) => {
        const target = event.target as Element
        const el = target.closest?.('[data-board-id]') as HTMLElement | null
        if (el) {
          const id = el.dataset.boardId!
          const pos = positions[id]!
          const z = nextZ()
          drag.current = {
            id,
            startX: event.clientX,
            startY: event.clientY,
            ox: pos.x,
            oy: pos.y,
            z,
          }
          setDragId(id)
          // Grabbing a card is the move the peel was arming for.
          if (peeledId && peeledId !== id) setPeeledId(null)
          // Top of the pile while it travels, and it stays there.
          setPositions((p) => ({ ...p, [id]: { ...p[id]!, z } }))
        } else {
          // A press that began on the toolbar, the zoom chip or the "+ ADD"
          // link is chrome, not a board gesture. Capturing the pointer for it
          // retargets the subsequent click to this container, so the button
          // never fires — which is what made SCATTER, TIDY, CLUSTER BY, FIT and
          // "+ ADD" all inert — and it would pan the board under the thumb too.
          if (target.closest?.('button, a')) return
          // A press on the empty board dismisses the sheet and puts a peeled
          // card back down.
          setSheetId(null)
          setPeeledId(null)
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
          const { id, z, startX, startY } = drag.current
          // A press that never travelled is a tap, not a drag. On a phone it
          // opens the sheet; the z bump is abandoned so looking at an object
          // is not a write.
          if (coarse && Math.hypot(event.clientX - startX, event.clientY - startY) < 6) {
            cancelDrag()
            setSheetId(id)
            return
          }
          const pos = positions[id]!
          const settled = { x: Math.round(pos.x), y: Math.round(pos.y), z }
          // Snap the override to the integers the server will store, or the
          // sub-pixel difference keeps it alive past the revalidate that should
          // have retired it.
          setPositions((p) => ({ ...p, [id]: settled }))
          const point = worldPoint(event.clientX, event.clientY)
          const target = clusterAt(point.x, point.y)
          drag.current = null
          setDragId(null)
          setHoverCluster(null)
          if (peeledId === id) setPeeledId(null)
          startTransition(async () => {
            // The same numbers the override holds, so the next revalidate
            // matches it and retires it instead of pinning a stale position.
            await moveObjectAction(id, settled.x, settled.y, settled.z)
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
      onPointerCancel={() => {
        // Dragging a cutout's <img> starts a native HTML5 image drag, which
        // releases pointer capture and fires pointercancel with no pointerup.
        // Without this the drag ref stays populated for the rest of the
        // session and every later pan drags that same object instead.
        cancelDrag()
        pan.current = null
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

        {visibleItems.map((item) => {
          const pos = positions[item.id]!
          const aspect = aspectOf(item.faceW, item.faceH)
          const width = cutoutWidth(item.silhouette as Silhouette, aspect, { min: 72, max: 160 })
          const dragging = dragId === item.id
          const peeled = peeledId === item.id
          return (
            <div
              key={item.id}
              data-board-id={item.id}
              className="absolute cursor-grab transition-transform duration-300 motion-reduce:transition-none"
              style={{
                left: pos.x,
                top: pos.y,
                zIndex: pos.z,
                cursor: dragging ? 'grabbing' : 'grab',
                // The peel: up off the board and slightly askew, with the
                // dragging shadow's bloom. The rotation lives on the wrapper so
                // it composes with the cutout's own persisted rotation.
                transform: peeled ? 'translateY(-14px) rotate(2.5deg)' : undefined,
              }}
            >
              <Cutout
                width={width}
                silhouette={item.silhouette as Silhouette}
                cut={item.cutStyle as CutStyle}
                rotate={item.rotationDeg}
                aspect={aspect}
                src={item.cutoutUrl ?? undefined}
                thumbSrc={item.thumbUrl ?? undefined}
                alt={item.title}
                label={item.cutoutUrl ? undefined : (item.kind ?? undefined)}
                state={dragging || peeled ? 'dragging' : 'idle'}
              />
            </div>
          )
        })}
      </div>

      <FilterRail
        facets={facets}
        selected={filters}
        onToggle={(group, value) => setFilters((f) => toggled(f, group, value))}
        onClear={() => setFilters(emptySelection())}
        className="absolute top-[calc(max(1.25rem,env(safe-area-inset-top))+118px)] left-[max(1.25rem,env(safe-area-inset-left))] max-sm:hidden"
      />

      <Toolbar
        total={items.length}
        shown={visibleItems.length}
        scale={viewport.scale}
        onFit={() => saveViewport({ x: 0, y: 0, scale: 0.62 })}
        onTidy={() => startTransition(async () => tidyBoardAction())}
        onScatter={() => startTransition(async () => scatterBoardAction())}
        onClusterBy={(d) =>
          startTransition(async () => {
            await clusterByAction(d)
            router.refresh()
          })
        }
      />

    </div>

    {/* A sibling of the canvas, not a child: presses inside the sheet must
        not reach the pan handler, which dismisses on any board press. */}
    {sheetObject ? (
      <BoardSheet
        object={sheetObject}
        onPeel={() => {
          setSheetId(null)
          setPeeledId(sheetObject.id)
        }}
        onClose={() => setSheetId(null)}
      />
    ) : null}
    </>
  )
}

type Dimension = 'person' | 'place' | 'year' | 'kind'

function Toolbar({
  total,
  shown,
  scale,
  onFit,
  onTidy,
  onScatter,
  onClusterBy,
}: {
  total: number
  shown: number
  scale: number
  onFit: () => void
  onTidy: () => void
  onScatter: () => void
  onClusterBy: (dimension: Dimension) => void
}) {
  const [open, setOpen] = useState(false)
  const filtered = shown < total
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
          {filtered ? 'Filtered' : 'Everything'}{' '}
          <span className="mn text-[9px]" style={{ color: 'var(--mute-3)' }}>
            {filtered ? `${shown} OF ${total}` : total}
          </span>
        </span>
        <span className="h-5 w-px bg-hair-strong" />
        <button onClick={onScatter} className="mn rounded-lg px-2.5 py-2 text-[9px] tracking-[0.08em]" style={{ color: 'var(--mute-2)' }}>
          SCATTER
        </button>
        <button onClick={onTidy} className="mn rounded-lg px-2.5 py-2 text-[9px] tracking-[0.08em]" style={{ color: 'var(--mute-2)' }}>
          TIDY
        </button>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mn rounded-lg px-2.5 py-2 text-[9px] font-medium tracking-[0.08em]"
            style={{
              background: open ? 'color-mix(in srgb, var(--ink) 10%, transparent)' : undefined,
            }}
          >
            CLUSTER BY ▾
          </button>
          {open ? (
            <div
              className="absolute top-full left-0 mt-1.5 flex w-[132px] flex-col gap-0.5 rounded-[10px] border border-hair-strong p-1.5"
              style={{
                background: 'color-mix(in srgb, var(--panel) 96%, transparent)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 10px 24px rgb(var(--shadow-ink) / 0.16)',
              }}
            >
              {(['person', 'place', 'year', 'kind'] as Dimension[]).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setOpen(false)
                    onClusterBy(d)
                  }}
                  className="mn rounded-md px-2 py-1.5 text-left text-[9px] tracking-[0.08em] uppercase"
                  style={{ color: 'var(--mute-2)' }}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : null}
        </div>

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
