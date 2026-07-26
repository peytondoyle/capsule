import type { CSSProperties } from 'react'

import { CUT_STYLES, HATCH, SILHOUETTES, type CutStyle, type Silhouette } from './silhouettes'

export type CutoutState = 'idle' | 'active' | 'pending' | 'dragging'

export type CutoutProps = {
  /** Outer sticker width in px, including the white edge. */
  width: number
  silhouette?: Silhouette
  cut?: CutStyle
  /** Persisted per-object jitter, in degrees. Never generate this at render. */
  rotate?: number
  /** Face aspect ratio (w / h). Defaults to a squarish 1.15. */
  aspect?: number
  /** Alpha cutout URL. Absent until phase 6 has produced one. */
  src?: string | null
  alt?: string
  /** Mono caption shown inside the placeholder, e.g. "boarding pass". */
  label?: string
  state?: CutoutState
  /** Opt in to the delegated tilt listener from <TiltLayer>. */
  interactive?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * The single most important component in the app.
 *
 * Every object is a die-cut cutout with a white sticker edge and a real shadow,
 * never a rectangle in a card. Three nested elements do the work:
 *
 *   outer   carries the rotation and the two-layer drop-shadow, so the shadow
 *           traces the silhouette rather than a bounding box
 *   sticker the white (or warm off-white, in the Cabinet) paper edge
 *   face    the image, or the hatch placeholder while one is being made
 *
 * Deliberately server-renderable: the Ledger puts hundreds of these on a page
 * and none of them need to ship as client components. Interactivity is added by
 * a single delegated listener — see <TiltLayer>.
 */
export function Cutout({
  width,
  silhouette = 'card',
  cut = 'edge',
  rotate = 0,
  aspect = 1.15,
  src,
  alt,
  label,
  state = 'idle',
  interactive = false,
  className,
  style,
}: CutoutProps) {
  const cutSpec = CUT_STYLES[cut]
  const shape = SILHOUETTES[silhouette]

  // FULL means "I did not cut it out" — an honest escape hatch that must not
  // pretend to have a silhouette.
  const uncut = cutSpec.uncut === true
  const pad = cutSpec.pad
  const chin = shape.chin ?? 0

  const faceWidth = width - pad * 2
  const faceHeight = Math.round(shape.square ? faceWidth : faceWidth / aspect)

  const shapeStyle: CSSProperties = uncut
    ? { borderRadius: '1px' }
    : shape.clipPath
      ? { clipPath: shape.clipPath }
      : { borderRadius: shape.radius }

  return (
    <div
      className={['cutout-shadow', className].filter(Boolean).join(' ')}
      data-state={state}
      {...(interactive ? { 'data-sticker': '' } : {})}
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      <div
        style={{
          background: 'var(--paper)',
          padding: `${pad}px ${pad}px ${pad + chin}px`,
          width,
          boxSizing: 'border-box',
          ...shapeStyle,
        }}
      >
        <div
          style={{
            height: faceHeight,
            background: src ? undefined : HATCH,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: shape.square ? 'center' : 'flex-start',
            padding: 8,
            boxSizing: 'border-box',
            ...(uncut
              ? {
                  borderRadius: '1px',
                  // --mute-3, not --hair-strong: a 12%-white hairline vanishes
                  // against the Cabinet's #151418 and "uncut" stops reading.
                  outline: '1px dashed var(--mute-3)',
                  outlineOffset: 3,
                }
              : shapeStyle),
          }}
        >
          {src ? (
            // Not next/image: these are already exact-size alpha WebPs, and
            // re-encoding through the optimizer risks flattening the alpha that
            // the drop-shadow needs in order to trace the silhouette.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt ?? label ?? ''}
              width={faceWidth}
              height={faceHeight}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : label ? (
            <span
              className="mn"
              style={{
                fontSize: 7,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--fill-ink)',
              }}
            >
              {label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
