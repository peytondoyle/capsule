import type { CSSProperties } from 'react'

import { Chip, Hairline, Meta, MonoLabel } from '@/design'
import { receivedLabel, type DatePrecision } from '@/lib/format'

export const BOARD_HOVER_CARD_WIDTH = 210

export type HoverCardObject = {
  title: string
  giver: string | null
  placeName: string | null
  receivedAt: string | null
  receivedPrecision: DatePrecision
}

export function BoardHoverCard({
  object,
  impliedTags,
  className,
  style,
}: {
  object: HoverCardObject
  impliedTags: string[]
  className?: string
  style?: CSSProperties
}) {
  const meta = [
    object.giver,
    receivedLabel(object.receivedAt, object.receivedPrecision),
    object.placeName,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside
      className={[
        'pointer-events-none w-[210px] rounded-[10px] border border-hair bg-panel p-[12px_13px]',
        'filter-[drop-shadow(0_8px_12px_rgb(var(--shadow-ink)_/_0.12))]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="text-[13px] leading-[1.2] font-semibold tracking-[-0.02em]">{object.title}</div>
      {meta ? <Meta className="mt-1">{meta}</Meta> : null}
      <Hairline className="my-2.5" />
      <MonoLabel className="text-mute-3">Drop here to file under</MonoLabel>
      {impliedTags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {impliedTags.map((tag, index) => (
            <Chip key={tag} variant={index === 0 ? 'solid' : 'add'}>
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </aside>
  )
}
