import type { CSSProperties, ReactNode } from 'react'

export type SurfaceName = 'ledger' | 'board' | 'cabinet'

/**
 * Sets the palette for everything inside it. Ledger / Board / Cabinet are
 * places, not themes — the view switcher swaps this attribute and every
 * primitive downstream re-reads its variables.
 */
export function Surface({
  name,
  children,
  className,
  style,
}: {
  name: SurfaceName
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      data-surface={name}
      className={['bg-bg text-ink', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  )
}

/**
 * The Board's work surface: a soft top light over a 26px grid, both faint
 * enough to read as tooth in paper rather than as a grid.
 */
export function GrainSurface({
  children,
  className,
  style,
}: {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={['relative', className].filter(Boolean).join(' ')} style={style}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 'var(--grain)',
          background: [
            'radial-gradient(120% 90% at 50% 0%, rgb(255 255 255 / 0.55), transparent 60%)',
            'repeating-linear-gradient(0deg, rgb(90 74 50 / 0.045) 0 1px, transparent 1px 26px)',
            'repeating-linear-gradient(90deg, rgb(90 74 50 / 0.045) 0 1px, transparent 1px 26px)',
          ].join(','),
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * The Cabinet's signature move: a hairline of light under each shelf, with a
 * short downward bloom. Get this wrong and the whole surface reads as a plain
 * dark theme.
 */
export function ShelfRule({ dim = false }: { dim?: boolean }) {
  const strength = dim ? 0.4 : 0.55
  return (
    <div aria-hidden>
      <div
        style={{
          height: 1,
          background: `linear-gradient(90deg, transparent, rgb(255 247 228 / ${strength}) 8%, rgb(255 247 228 / ${strength}) 92%, transparent)`,
          boxShadow: dim ? 'none' : '0 0 14px rgb(255 240 205 / 0.28)',
        }}
      />
      {dim ? null : (
        <div
          style={{
            height: 26,
            background: 'linear-gradient(rgb(255 247 228 / 0.055), transparent)',
          }}
        />
      )}
    </div>
  )
}
