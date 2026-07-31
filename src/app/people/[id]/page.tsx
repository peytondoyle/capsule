import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { BackLink, Cutout, TiltLayer, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import { countLine, dayMonthLabel, initialsOf } from '@/lib/format'
import { getCurrentUser } from '@/server/auth'
import { getPerson, getPersonStats, listObjectsByPerson } from '@/server/people'

export const metadata: Metadata = { title: 'Person — Capsule' }

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const { id } = await params
  const person = await getPerson(user.id, id)
  if (!person) notFound()

  const [stats, rows] = await Promise.all([
    getPersonStats(user.id, id),
    listObjectsByPerson(user.id, id),
  ])

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <TiltLayer />
      <div className="mx-auto max-w-[760px] px-6 pt-10 pb-16">
        <nav className="mb-10 flex items-center justify-between">
          <BackLink href="/people" label="Back to people" />
          <span className="mn text-[9px] tracking-[0.16em] text-mute-2">GIVEN BY</span>
          <span className="w-3" />
        </nav>

        <header className="flex items-center gap-4">
          <span
            aria-hidden
            className="mn flex size-12 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
            style={{ background: '#e7e0d3', color: '#6d6355' }}
          >
            {initialsOf(person.name, person.initials)}
          </span>
          <div>
            <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
              {person.name}
            </h1>
            <div className="mn mt-1.5 text-[9px] tracking-[0.1em] text-mute-2">
              {countLine([rows.length, 'object'])}
              {stats?.firstYear && stats?.lastYear
                ? ` · ${stats.firstYear === stats.lastYear ? stats.firstYear : `${stats.firstYear} — ${stats.lastYear}`}`
                : ''}
            </div>
          </div>
        </header>

        <ul className="mt-12 flex flex-wrap items-start gap-[30px]">
          {rows.map(({ object, recto }) => {
            const aspect = aspectOf(recto?.width, recto?.height)
            const width = cutoutWidth(object.silhouette as Silhouette, aspect)
            return (
              <li key={object.id} style={{ width: Math.max(width + 26, 118) }}>
                <Link href={`/o/${object.lotNo}`} className="block">
                  <Cutout
                    width={width}
                    silhouette={object.silhouette as Silhouette}
                    cut={object.cutStyle as CutStyle}
                    rotate={object.rotationDeg}
                    aspect={aspect}
                    src={recto?.cutoutUrl ?? undefined}
                    alt={object.title}
                    label={recto?.cutoutUrl ? undefined : (object.kind ?? undefined)}
                    interactive
                  />
                  <div className="mt-3 text-[12px] leading-[1.3] font-medium tracking-[-0.01em]">
                    {object.title}
                  </div>
                  <div className="mn mt-[3px] text-[8.5px] tracking-[0.06em] uppercase text-mute-2">
                    {dayMonthLabel(object.receivedAt, object.receivedPrecision) || 'UNDATED'}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
