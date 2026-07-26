import type { ReactNode } from 'react'

import { Cutout, type CutoutProps } from './cutout'

/**
 * The batch queue's card deck. Two ghost layers behind the live one, so "there
 * are more of these waiting" is legible without a counter.
 */
export function StickerDeck({
  top,
  depth = 2,
  className,
}: {
  top: CutoutProps
  depth?: number
  className?: string
}) {
  // Fixed, not random: the deck must not reshuffle between renders.
  const ghosts = [
    { rotate: 6, scale: 0.92, opacity: 0.5, offset: 16 },
    { rotate: -3, scale: 0.96, opacity: 0.75, offset: 10 },
  ].slice(-depth)

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      {ghosts.map((ghost, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute left-1/2 top-0"
          style={{
            transform: `translateX(-50%) translateY(${ghost.offset}px) rotate(${ghost.rotate}deg) scale(${ghost.scale})`,
            opacity: ghost.opacity,
          }}
        >
          <Cutout {...top} label={undefined} />
        </div>
      ))}
      <div className="relative flex justify-center">
        <Cutout {...top} />
      </div>
    </div>
  )
}

/**
 * The detected-edge frame.
 *
 * `handles` is the Ledger capture step — a dashed rust box with four draggable
 * square corners. `brackets` is the Cabinet's accession scanner — gold corner
 * brackets and, while reading, a travelling scan line.
 *
 * The manual corner drag is the primary path, not a fallback: the doc already
 * says "DRAG A CORNER TO CORRECT", which means a merely-decent detector still
 * makes for a good experience.
 */
export function ScanFrame({
  variant = 'handles',
  scanning = false,
  children,
  caption,
}: {
  variant?: 'handles' | 'brackets'
  scanning?: boolean
  children?: ReactNode
  caption?: ReactNode
}) {
  const color = variant === 'brackets' ? 'var(--accent)' : 'var(--accent)'
  const corner = 14
  const inset = -9

  return (
    <div className="relative inline-block">
      {children}

      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset,
          border: `1.5px ${variant === 'handles' ? 'dashed' : 'solid'} ${color}`,
          borderRadius: 6,
          ...(variant === 'brackets' ? { borderColor: 'transparent' } : {}),
        }}
      />

      {(
        [
          ['top', 'left'],
          ['top', 'right'],
          ['bottom', 'left'],
          ['bottom', 'right'],
        ] as const
      ).map(([v, h]) => (
        <div
          key={`${v}-${h}`}
          aria-hidden
          className="pointer-events-none absolute"
          style={
            variant === 'handles'
              ? {
                  [v]: inset,
                  [h]: inset,
                  width: 9,
                  height: 9,
                  background: 'var(--bg)',
                  border: `1.5px solid ${color}`,
                }
              : {
                  [v]: inset,
                  [h]: inset,
                  width: corner,
                  height: corner,
                  [`border${v === 'top' ? 'Top' : 'Bottom'}`]: `2px solid ${color}`,
                  [`border${h === 'left' ? 'Left' : 'Right'}`]: `2px solid ${color}`,
                }
          }
        />
      ))}

      {scanning ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: '44%',
            height: 2,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            boxShadow: `0 0 22px color-mix(in srgb, ${color} 75%, transparent)`,
          }}
        />
      ) : null}

      {caption ? (
        <div className="mn absolute inset-x-0 -bottom-11 text-center text-[9px] leading-[1.7] tracking-[0.12em] uppercase text-mute-2">
          {caption}
        </div>
      ) : null}
    </div>
  )
}
