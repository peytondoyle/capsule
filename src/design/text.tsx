import type { ReactNode } from 'react'

/**
 * The typographic split is the whole system: prose is warm, data is archival.
 * These three components are the only sanctioned way to render data, so that
 * "is this mono?" stops being a judgement call at every call site.
 */

type TextProps = {
  children: ReactNode
  className?: string
}

/** Field labels: FROM, RECEIVED, GIVEN BY, CUT STYLE. */
export function MonoLabel({ children, className }: TextProps) {
  return (
    <span
      className={['mn text-[9px] tracking-[0.13em] uppercase text-mute-2', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}

/** Caption lines under a cutout: NINA · 09 APR, DAD · 12 NOV 2019 · LISBON. */
export function Meta({ children, className }: TextProps) {
  return (
    <div
      className={['mn text-[8.5px] tracking-[0.06em] uppercase text-mute-2', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/** Section headers inside a panel: THE STORY, THE OBJECT ITSELF, NOTE. */
export function SectionLabel({ children, className }: TextProps) {
  return (
    <div
      className={['mn text-[8.5px] tracking-[0.14em] uppercase text-mute-3', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/** Hairline rule. Never a box — 1px at 9–14% ink is the only divider we use. */
export function Hairline({ strong = false, className }: { strong?: boolean; className?: string }) {
  return (
    <hr
      className={[
        'border-0 border-t',
        strong ? 'border-hair-strong' : 'border-hair',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}
