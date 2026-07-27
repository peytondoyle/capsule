import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Cutout,
  FieldRows,
  Inspector,
  TiltLayer,
  aspectOf,
  cutoutWidth,
  type CutStyle,
  type Silhouette,
} from '@/design'
import { RetentionControl } from '@/components/retention-control'
import { Tags } from '@/components/tag-editor'
import { countLine, lotLabel, receivedLabel } from '@/lib/format'
import { getArchiveSummary, getDefaultLot, getObjectDetail } from '@/server/archive'
import { getCurrentUser } from '@/server/auth'
import { listTimeline, searchObjects } from '@/server/objects'
import { listPeopleWithCounts } from '@/server/people'
import { Rail } from './rail'
import { Stream } from './stream'

export const metadata: Metadata = { title: 'Timeline — Capsule' }

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string; q?: string }>
}) {
  // getCurrentUser, not auth(): it also creates the users row on first sight.
  // Every foreign key points at users.id, so an authed page that skips this
  // renders an empty archive and then FK-fails on the first object added.
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const userId = user.id

  const { lot, q } = await searchParams
  const requested = Number.parseInt(lot ?? '', 10)
  const query = q?.trim() || null

  const [summary, people, rows] = await Promise.all([
    getArchiveSummary(userId),
    listPeopleWithCounts(userId),
    query ? searchObjects(userId, query) : listTimeline(userId),
  ])

  const activeLot = Number.isNaN(requested) ? await getDefaultLot(userId) : requested
  const detail = activeLot === null ? null : await getObjectDetail(userId, activeLot)

  return (
    <div data-surface="ledger" className="flex h-dvh overflow-hidden bg-bg text-ink">
      <TiltLayer />
      <Rail summary={summary} people={people} />

      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar total={summary.objects} query={query} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {query ? (
            <SearchResults rows={rows} query={query} activeLot={detail?.lotNo ?? null} />
          ) : (
            <Stream rows={rows} activeLot={detail?.lotNo ?? null} />
          )}
        </div>
      </main>

      {detail ? <Detail detail={detail} /> : null}
    </div>
  )
}

function Toolbar({ total, query }: { total: number; query: string | null }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3.5 border-b border-hair px-6">
      <form action="/timeline" className="mn flex h-[30px] max-w-[330px] flex-1 items-center gap-2 rounded-[7px] border border-hair-strong bg-paper px-3 text-[10.5px]">
        <span aria-hidden className="opacity-50">
          ⌕
        </span>
        <input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder={`search ${countLine([total, 'object']).toLowerCase()}`}
          className="w-full bg-transparent outline-none placeholder:text-mute-2"
        />
      </form>

      <div className="ml-auto flex gap-1.5">
        <span className="mn rounded-md border border-hair-strong px-[11px] py-1.5 text-[9px] tracking-[0.08em] text-mute-1">
          NEWEST
        </span>
        <Link
          href="/accession"
          className="mn rounded-md bg-ink px-[11px] py-1.5 text-[9px] font-medium tracking-[0.08em] text-bg"
        >
          + ADD OBJECT
        </Link>
      </div>
    </div>
  )
}

function Detail({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getObjectDetail>>>
}) {
  const recto = detail.faces.find((face) => face.role === 'recto') ?? detail.faces[0]
  const aspect = aspectOf(recto?.width, recto?.height)

  return (
    <Inspector
      hero={
        <Cutout
          width={cutoutWidth(detail.silhouette as Silhouette, aspect, { min: 150, max: 216 })}
          silhouette={detail.silhouette as Silhouette}
          cut={detail.cutStyle as CutStyle}
          rotate={detail.rotationDeg}
          aspect={aspect}
          src={recto?.cutoutUrl ?? undefined}
          alt={detail.title}
          label={recto?.cutoutUrl ? undefined : (detail.kind ?? undefined)}
          interactive
        />
      }
      lot={
        <Link href={`/o/${detail.lotNo}`} className="underline-offset-4 hover:underline">
          {lotLabel(detail.lotNo)}
        </Link>
      }
      title={detail.title}
      rows={
        <FieldRows
          rows={[
            { label: 'From', value: detail.givenBy.map((p) => p.name).join(', ') || null },
            {
              label: 'Received',
              value: receivedLabel(detail.receivedAt, detail.receivedPrecision) || null,
              mono: true,
            },
            { label: 'Origin', value: detail.placeName },
            { label: 'Occasion', value: detail.occasionName },
          ]}
        />
      }
      story={detail.story}
      footer={<Tags objectId={detail.id} tags={detail.tags} />}
    >
      <RetentionControl
        objectId={detail.id}
        value={detail.retention}
        location={detail.retainedLocation}
      />
    </Inspector>
  )
}


function SearchResults({
  rows,
  query,
  activeLot,
}: {
  rows: Awaited<ReturnType<typeof searchObjects>>
  query: string
  activeLot: number | null
}) {
  return (
    <div className="px-6 pt-[26px]">
      <div className="flex items-baseline gap-3 border-b border-hair-strong pb-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">&ldquo;{query}&rdquo;</h2>
        <span className="mn text-[9px] tracking-[0.1em] text-mute-2">
          {countLine([rows.length, 'result'])}
        </span>
        <Link href="/timeline" className="mn ml-auto text-[9px] tracking-[0.1em] text-mute-2">
          CLEAR
        </Link>
      </div>
      <ul className="flex flex-wrap items-start gap-[30px] px-1 pt-6 pb-[22px]">
        {rows.map(({ object, recto, giver }) => {
          const aspect = aspectOf(recto?.width, recto?.height)
          const width = cutoutWidth(object.silhouette as Silhouette, aspect)
          const active = object.lotNo === activeLot
          return (
            <li key={object.id} style={{ width: Math.max(width + 26, 118) }}>
              <Link
                href={`/timeline?q=${encodeURIComponent(query)}&lot=${object.lotNo}`}
                scroll={false}
                className="block"
              >
                <Cutout
                  width={width}
                  silhouette={object.silhouette as Silhouette}
                  cut={object.cutStyle as CutStyle}
                  rotate={object.rotationDeg}
                  aspect={aspect}
                  src={recto?.cutoutUrl ?? undefined}
                  alt={object.title}
                  label={recto?.cutoutUrl ? undefined : (object.kind ?? undefined)}
                  state={active ? 'active' : 'idle'}
                  interactive
                />
                <div className="mt-3 text-[12px] leading-[1.3] font-medium tracking-[-0.01em]">
                  {object.title}
                </div>
                <div className="mn mt-[3px] text-[8.5px] tracking-[0.06em] uppercase text-mute-2">
                  {[giver?.toUpperCase(), receivedLabel(object.receivedAt, object.receivedPrecision)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
