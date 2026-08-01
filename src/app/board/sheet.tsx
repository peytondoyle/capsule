'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

import { Chip, Cutout, Meta, SheetPhone, aspectOf, type CutStyle, type Silhouette } from '@/design'
import { receivedLabel, type DatePrecision } from '@/lib/format'

export type SheetObject = {
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
}

/**
 * The Board phone sheet: tap a cutout, get the object. 296px, per the mockup.
 * Non-modal on purpose — the board stays pannable behind it, and a press on
 * the canvas dismisses it.
 */
export function BoardSheet({
  object,
  onPeel,
  onClose,
}: {
  object: SheetObject
  onPeel: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const meta = [
    object.giver,
    receivedLabel(object.receivedAt, object.receivedPrecision),
    object.placeName,
  ]
    .filter(Boolean)
    .join(' · ')
  const shownTags = object.tags.slice(0, 4)

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={object.title}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] translate-y-0 outline-none transition-transform duration-300 starting:translate-y-full motion-reduce:transition-none"
    >
      <SheetPhone height={296} className="pb-[env(safe-area-inset-bottom)]">
        <div className="mt-4 flex items-center gap-3.5">
          <Cutout
            width={74}
            silhouette={object.silhouette as Silhouette}
            cut={object.cutStyle as CutStyle}
            rotate={object.rotationDeg}
            aspect={aspectOf(object.faceW, object.faceH)}
            src={object.cutoutUrl ?? undefined}
            thumbSrc={object.thumbUrl ?? undefined}
            alt=""
            label={object.cutoutUrl ? undefined : (object.kind ?? undefined)}
          />
          <div className="min-w-0">
            <div className="text-[17px] leading-[1.2] font-semibold tracking-[-0.025em]">
              {object.title}
            </div>
            {meta ? <Meta className="mt-1.5">{meta}</Meta> : null}
          </div>
        </div>
        {object.story ? (
          <p className="mt-3.5 line-clamp-2 text-[13.5px] leading-[1.55] text-pretty text-mute-1">
            {object.story}
          </p>
        ) : null}
        {shownTags.length ? (
          <div className="mt-3.5 flex flex-wrap gap-1.5 overflow-hidden">
            {shownTags.map((tag) => (
              <Chip key={tag} size="md">
                {tag}
              </Chip>
            ))}
            {object.tags.length > shownTags.length ? (
              <Chip size="md">+ {object.tags.length - shownTags.length}</Chip>
            ) : null}
          </div>
        ) : null}
        <div className="mt-auto mb-5 flex gap-2">
          <button
            onClick={onPeel}
            className="h-11 flex-1 rounded-[11px] border border-hair-strong text-[13px] font-medium"
          >
            Peel &amp; move
          </button>
          <Link
            href={`/o/${object.lotNo}`}
            className="flex h-11 flex-1 items-center justify-center rounded-[11px] bg-ink text-[13px] font-medium text-bg"
          >
            Open
          </Link>
        </div>
      </SheetPhone>
    </div>
  )
}
