'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Corner = { x: number; y: number }

const DEFAULT: Corner[] = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
]

/**
 * The cut step: "EDGE FOUND AUTOMATICALLY / DRAG A CORNER TO CORRECT".
 *
 * Manual is the primary path, not the fallback — the doc says so, which is why
 * this ships before any detector. Corners are normalised 0–1 so they survive
 * whatever resolution the derivative pipeline works at.
 */
export function CornerEditor({
  itemId,
  initialCorners,
}: {
  itemId: string
  initialCorners: Corner[] | null
}) {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const [corners, setCorners] = useState<Corner[]>(initialCorners ?? DEFAULT)
  const [dragging, setDragging] = useState<number | null>(null)
  const [busy, startTransition] = useTransition()

  function toLocal(event: React.PointerEvent) {
    const box = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    }
  }

  function save() {
    startTransition(async () => {
      const res = await fetch('/api/derive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, corners }),
      })
      if (res.ok) {
        // Re-extract against the corrected cutout; ignore 501 when no key.
        void fetch('/api/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId }),
        }).catch(() => {})
        router.push('/queue')
      }
    })
  }

  // The bbox the four corners imply — the dashed rust rectangle.
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const box = {
    left: `${Math.min(...xs) * 100}%`,
    top: `${Math.min(...ys) * 100}%`,
    width: `${(Math.max(...xs) - Math.min(...xs)) * 100}%`,
    height: `${(Math.max(...ys) - Math.min(...ys)) * 100}%`,
  }

  return (
    <div>
      <div
        ref={boxRef}
        className="relative touch-none overflow-hidden rounded-[16px]"
        style={{
          background:
            'repeating-linear-gradient(45deg, color-mix(in srgb, var(--ink) 3%, transparent) 0 8px, transparent 8px 16px)',
        }}
        onPointerMove={(event) => {
          if (dragging === null) return
          const point = toLocal(event)
          setCorners((current) => current.map((c, i) => (i === dragging ? point : c)))
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-proxied
            original; next/image cannot optimise an authenticated stream */}
        <img
          src={`/api/original/${itemId}`}
          alt=""
          className="block w-full select-none"
          draggable={false}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[6px] border-[1.5px] border-dashed border-accent"
          style={box}
        />

        {corners.map((corner, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Corner ${i + 1}`}
            onPointerDown={(event) => {
              event.preventDefault()
              ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
              setDragging(i)
            }}
            className="absolute z-10 size-[22px] -translate-x-1/2 -translate-y-1/2 touch-none"
            style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
          >
            <span className="block size-[11px] translate-x-1/2 translate-y-1/2 border-[1.5px] border-accent bg-bg" />
          </button>
        ))}
      </div>

      <p className="mn mt-5 text-center text-[9px] leading-[1.7] tracking-[0.12em] text-mute-2 uppercase">
        Drag a corner to correct
      </p>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setCorners(DEFAULT)}
          className="mn h-11 rounded-[11px] border border-hair-strong px-4 text-[10px] tracking-[0.12em]"
        >
          RESET
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mn h-11 flex-1 rounded-[11px] bg-ink text-[10px] font-medium tracking-[0.14em] text-bg disabled:opacity-45"
        >
          {busy ? 'CUTTING…' : 'CUT IT OUT'}
        </button>
      </div>
    </div>
  )
}
