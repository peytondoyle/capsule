import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Cutout, Hairline, Meta, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import { receivedLabel } from '@/lib/format'
import { getSharedObject } from '@/server/shares'

export const metadata: Metadata = {
  title: 'A keepsake — Capsule',
  robots: { index: false, follow: false },
}

/**
 * The public face of one object. No session, no chrome, no edit affordances —
 * a token-holder sees the five fields and the picture, full stop. The lot
 * number and the shelf location stay home.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await getSharedObject(token)
  if (!shared) notFound()

  const recto = shared.faces.find((face) => face.role === 'recto') ?? shared.faces[0]
  const aspect = aspectOf(recto?.width, recto?.height)

  const meta = [
    shared.giver,
    receivedLabel(shared.receivedAt, shared.receivedPrecision),
    shared.placeName,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-6">
        <div
          className="flex justify-center pt-14 pb-8"
          style={{ background: 'linear-gradient(var(--bg), var(--panel))' }}
        >
          <Cutout
            width={cutoutWidth(shared.silhouette as Silhouette, aspect, { min: 200, max: 280 })}
            silhouette={shared.silhouette as Silhouette}
            cut={shared.cutStyle as CutStyle}
            rotate={shared.rotationDeg}
            aspect={aspect}
            src={recto?.cutoutUrl ?? undefined}
            alt={shared.title}
            label={recto?.cutoutUrl ? undefined : (shared.kind ?? undefined)}
          />
        </div>

        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.03em]">
          {shared.title}
        </h1>
        {meta ? <Meta className="mt-2.5 text-[9.5px] tracking-[0.1em]">{meta}</Meta> : null}

        {shared.occasionName ? (
          <Meta className="mt-1.5">{shared.occasionName}</Meta>
        ) : null}

        {shared.story ? (
          <p className="mt-5 text-[15px] leading-[1.65] text-pretty text-mute-1">
            {shared.story}
          </p>
        ) : null}

        <div className="mt-auto pb-10">
          <Hairline className="mb-4" />
          <div className="mn text-[8.5px] tracking-[0.14em] text-mute-3">
            KEPT IN CAPSULE · AN ARCHIVE OF GIVEN THINGS
          </div>
        </div>
      </div>
    </div>
  )
}
