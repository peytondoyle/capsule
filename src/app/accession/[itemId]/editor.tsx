'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/** Mirrors DetectResponse in src/detect-worker.ts. Declared rather than
 * imported: importing the worker module would pull scanic into this route's
 * bundle, which is the one thing the out-of-band worker build exists to make
 * impossible. */
type DetectResponse = {
  id: number
  corners: { x: number; y: number }[] | null
  confidence: number | null
  ms: number
}

type Corner = { x: number; y: number }

/** DEFAULT is ordered top-left, top-right, bottom-right, bottom-left. */
const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const

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
  const imageRef = useRef<HTMLImageElement>(null)
  const [corners, setCorners] = useState<Corner[]>(initialCorners ?? DEFAULT)
  const [dragging, setDragging] = useState<number | null>(null)
  const [busy, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [detection, setDetection] = useState<'idle' | 'looking' | 'found' | 'manual'>(
    initialCorners ? 'manual' : 'idle',
  )

  /**
   * Seeds the four corners from the photograph, once, on first arrival.
   *
   * Never when corners are already stored: this runs on mount, and a detector
   * that stomped a cut the user had already dragged and saved would be the
   * worst possible behaviour. The manual drag stays primary — this only moves
   * the starting box from a guess to a good guess, which is what the design's
   * "EDGE FOUND AUTOMATICALLY / DRAG A CORNER TO CORRECT" describes.
   */
  useEffect(() => {
    if (initialCorners) return
    const image = imageRef.current
    if (!image || typeof Worker === 'undefined') return

    let cancelled = false
    let worker: Worker | null = null

    const detect = () => {
      if (cancelled || !image.naturalWidth) return
      setDetection('looking')
      // Downscale on the main thread before handing the bytes over: a 12MP
      // photo is a ~48MB Uint8ClampedArray, and structured-cloning that per
      // item would jank the page. 800px is well above what the detector uses.
      const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight))
      const w = Math.max(1, Math.round(image.naturalWidth * scale))
      const h = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, w, h)

      try {
        worker = new Worker('/detect-worker.js', { type: 'module' })
      } catch {
        setDetection('manual')
        return
      }
      worker.addEventListener('message', (event: MessageEvent<DetectResponse>) => {
        if (cancelled) return
        const found = event.data.corners
        if (found && found.length === 4) {
          setCorners(found)
          setDetection('found')
        } else {
          setDetection('manual')
        }
        worker?.terminate()
      })
      worker.postMessage({ id: 1, image: context.getImageData(0, 0, w, h) })
    }

    if (image.complete) detect()
    else image.addEventListener('load', detect, { once: true })

    return () => {
      cancelled = true
      worker?.terminate()
    }
  }, [initialCorners])

  function toLocal(event: React.PointerEvent) {
    const box = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    }
  }

  function save() {
    setSaveError(null)
    startTransition(async () => {
      let res: Response
      try {
        res = await fetch('/api/derive', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId, corners }),
        })
      } catch {
        setSaveError('No connection — this will cut out when you are back online.')
        return
      }

      // 202 is the service worker's synthetic "queued offline" reply, and
      // res.ok is true for it — so this used to navigate to /queue as though
      // the cut had happened, when nothing had. A real non-2xx had no branch
      // at all: the button simply appeared inert.
      if (res.status === 202) {
        setSaveError('No signal — queued. This will cut out when you are back online.')
        return
      }
      if (!res.ok) {
        setSaveError(
          res.status === 401
            ? 'Signed out — sign in and try again.'
            : 'Could not cut this out. Try again.',
        )
        return
      }
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

  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)

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
          ref={imageRef}
          // Same-origin proxy, but getImageData still needs the canvas clean.
          crossOrigin="anonymous"
          src={`/api/original/${itemId}`}
          alt="The photograph you are cutting out"
          className="block w-full select-none"
          draggable={false}
        />

        {/* The quad itself, not its bounding box — the server warps exactly
            this shape now, and drawing a rectangle over four skewed handles
            told the user their cut was something it was not. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            // Screen pixels, because of non-scaling-stroke — matches the 1.5px
            // dashed accent everywhere else. The dash array is in viewBox units
            // and stays proportional to the photo instead.
            strokeWidth={1.5}
            strokeDasharray="1.6 1.1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {corners.map((corner, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${CORNER_NAMES[i] ?? `Corner ${i + 1}`} corner, ${Math.round(
              corner.x * 100,
            )}% across, ${Math.round(corner.y * 100)}% down. Arrow keys to move.`}
            onPointerDown={(event) => {
              event.preventDefault()
              ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
              setDragging(i)
            }}
            // The handles were focusable and announced but inert — the only way
            // to correct a cut was to drag it.
            onKeyDown={(event) => {
              const step = (event.shiftKey ? 0.05 : 0.01) * (event.altKey ? 0.2 : 1)
              const delta =
                event.key === 'ArrowLeft'
                  ? { x: -step, y: 0 }
                  : event.key === 'ArrowRight'
                    ? { x: step, y: 0 }
                    : event.key === 'ArrowUp'
                      ? { x: 0, y: -step }
                      : event.key === 'ArrowDown'
                        ? { x: 0, y: step }
                        : null
              if (!delta) return
              event.preventDefault()
              setCorners((current) =>
                current.map((c, j) =>
                  j === i
                    ? {
                        // Same clamp the pointer path uses, so the two cannot
                        // disagree about where the edge of the photograph is.
                        x: Math.min(1, Math.max(0, c.x + delta.x)),
                        y: Math.min(1, Math.max(0, c.y + delta.y)),
                      }
                    : c,
                ),
              )
            }}
            className="absolute z-10 size-[22px] -translate-x-1/2 -translate-y-1/2 touch-none"
            style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
          >
            <span className="block size-[11px] translate-x-1/2 translate-y-1/2 border-[1.5px] border-accent bg-bg" />
          </button>
        ))}
      </div>

      <p className="mn mt-5 text-center text-[9px] leading-[1.7] tracking-[0.12em] text-mute-2 uppercase">
        {detection === 'looking' ? (
          'Finding the edges…'
        ) : detection === 'found' ? (
          <>
            <span className="text-accent">Edge found automatically</span>
            <br />
            Drag a corner to correct
          </>
        ) : (
          'Drag a corner to correct'
        )}
      </p>
      {saveError ? (
        <p
          role="alert"
          className="mn mt-3 text-center text-[9px] leading-[1.7] tracking-[0.1em] text-accent uppercase"
        >
          {saveError}
        </p>
      ) : null}
      {/* Only while nothing is being dragged. Driven straight off pointermove
          this fired dozens of times a second and a screen reader read every one
          of them; the useful moment is when the corner comes to rest. */}
      <p aria-live="polite" className="sr-only">
        {dragging === null
          ? `Cut ${Math.round((Math.max(...xs) - Math.min(...xs)) * 100)}% wide by ${Math.round(
              (Math.max(...ys) - Math.min(...ys)) * 100,
            )}% tall`
          : ''}
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
