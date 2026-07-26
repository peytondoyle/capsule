import type { ReactNode } from 'react'

import { SectionLabel } from './text'

/**
 * The permanent right-hand panel. The design doc calls it out explicitly on the
 * Ledger ("a permanent inspector holds the story") and the Cabinet uses the same
 * anatomy one notch wider, so it is one component with a width prop rather than
 * two that will drift.
 */
export function Inspector({
  hero,
  lot,
  aside,
  title,
  rows,
  story,
  storyLabel = 'The story',
  footer,
  children,
  width = 322,
}: {
  /** A <Cutout>, lit on its own slightly different ground. */
  hero?: ReactNode
  /** OBJ-0147 on paper, LOT 0147 in gold. */
  lot?: string
  /** Right-aligned counterpart to the lot, e.g. "PAPER · 78 × 210 MM". */
  aside?: ReactNode
  title: ReactNode
  rows?: ReactNode
  story?: ReactNode
  storyLabel?: string
  footer?: ReactNode
  children?: ReactNode
  width?: number
}) {
  return (
    <aside
      className="flex shrink-0 flex-col border-l border-hair bg-panel"
      style={{ width }}
    >
      {hero ? (
        <div className="flex justify-center border-b border-hair bg-bg px-[22px] pt-[22px] pb-[18px]">
          {hero}
        </div>
      ) : null}

      <div className="px-[22px] pt-5">
        {lot || aside ? (
          <div className="flex items-baseline justify-between gap-3">
            {lot ? (
              <span className="mn text-[9px] tracking-[0.18em] uppercase text-accent">{lot}</span>
            ) : null}
            {aside ? (
              <span className="mn text-[9px] tracking-[0.1em] uppercase text-mute-3">{aside}</span>
            ) : null}
          </div>
        ) : null}
        <h2 className="mt-[7px] text-[19px] leading-[1.25] font-semibold tracking-[-0.025em]">
          {title}
        </h2>
      </div>

      {rows ? <div className="px-[22px] pt-[18px]">{rows}</div> : null}

      {story ? (
        <div className="px-[22px] pt-[18px]">
          <SectionLabel className="mb-2">{storyLabel}</SectionLabel>
          <p className="m-0 text-[12.5px] leading-[1.6] text-pretty text-mute-1">{story}</p>
        </div>
      ) : null}

      {children ? <div className="px-[22px] pt-[18px]">{children}</div> : null}

      {footer ? (
        <div className="mt-auto border-t border-hair px-[22px] py-4">{footer}</div>
      ) : null}
    </aside>
  )
}

/**
 * The phone bottom sheet, used by the Board (tap a cutout) and the Cabinet lot
 * view. Corner radius and the drag handle come straight from the mockups.
 */
export function SheetPhone({
  children,
  className,
  height,
}: {
  children: ReactNode
  className?: string
  height?: number
}) {
  return (
    <div
      className={[
        'flex flex-col rounded-t-[22px] bg-panel px-[22px]',
        'shadow-[0_-14px_40px_rgb(var(--shadow-ink)/0.22)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={height ? { height } : undefined}
    >
      <div
        aria-hidden
        className="mx-auto mt-[9px] h-1 w-[38px] shrink-0 rounded-[3px] bg-[color-mix(in_srgb,var(--ink)_22%,transparent)]"
      />
      {children}
    </div>
  )
}
