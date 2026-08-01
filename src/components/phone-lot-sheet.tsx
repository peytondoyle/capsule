import Link from 'next/link'

import { Cutout, Meta, SheetPhone, aspectOf, type CutStyle, type Silhouette } from '@/design'
import { lotLabel, receivedLabel } from '@/lib/format'
import type { ObjectDetail } from '@/server/archive'

/**
 * The phone answer to the desktop Inspector: tap an object on a narrow
 * viewport and this rises instead. Server-rendered, links only — selection is
 * already in the URL, so dismissing is a link back to the surface without
 * `?lot=`. The palette comes from the `data-surface` cascade, which is what
 * makes the lot line gold in the Cabinet and rust on the Ledger.
 */
export function PhoneLotSheet({
  detail,
  closeHref,
  lotStyle = 'obj',
}: {
  detail: ObjectDetail
  closeHref: string
  lotStyle?: 'obj' | 'lot'
}) {
  const recto = detail.faces.find((face) => face.role === 'recto') ?? detail.faces[0]
  const meta = [
    detail.givenBy.map((p) => p.name).join(', ') || null,
    receivedLabel(detail.receivedAt, detail.receivedPrecision) || null,
    detail.placeName,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="dialog"
      aria-label={detail.title}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] translate-y-0 transition-transform duration-300 starting:translate-y-full motion-reduce:transition-none lg:hidden"
    >
      <SheetPhone className="pb-[env(safe-area-inset-bottom)]">
        <div className="mt-4 flex items-center gap-3.5">
          <Cutout
            width={74}
            silhouette={detail.silhouette as Silhouette}
            cut={detail.cutStyle as CutStyle}
            rotate={detail.rotationDeg}
            aspect={aspectOf(recto?.width, recto?.height)}
            src={recto?.cutoutUrl ?? undefined}
            thumbSrc={recto?.thumbUrl ?? undefined}
            alt=""
            label={recto?.cutoutUrl ? undefined : (detail.kind ?? undefined)}
          />
          <div className="min-w-0">
            <div className="mn text-[9px] tracking-[0.14em] text-accent">
              {lotLabel(detail.lotNo, lotStyle)}
            </div>
            <div className="mt-1 text-[17px] leading-[1.2] font-semibold tracking-[-0.025em]">
              {detail.title}
            </div>
            {meta ? <Meta className="mt-1.5">{meta}</Meta> : null}
          </div>
        </div>
        {detail.story ? (
          <p className="mt-3.5 line-clamp-2 text-[13.5px] leading-[1.55] text-pretty text-mute-1">
            {detail.story}
          </p>
        ) : null}
        <div className="mt-5 mb-5 flex gap-2">
          <Link
            href={closeHref}
            className="flex h-11 flex-1 items-center justify-center rounded-[11px] border border-hair-strong text-[13px] font-medium"
          >
            Close
          </Link>
          <Link
            href={`/o/${detail.lotNo}`}
            className="flex h-11 flex-1 items-center justify-center rounded-[11px] bg-ink text-[13px] font-medium text-bg"
          >
            Open
          </Link>
        </div>
      </SheetPhone>
    </div>
  )
}
