import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Cutout,
  FieldRows,
  FieldRowsEdit,
  Inspector,
  TiltLayer,
  aspectOf,
  cutoutWidth,
  type CutStyle,
  type Silhouette,
} from '@/design'
import { RetentionControl } from '@/components/retention-control'
import { saveFieldsAction } from '@/server/actions/objects'
import { Tags } from '@/components/tag-editor'
import { countLine, lotLabel, receivedLabel } from '@/lib/format'
import { timelineHref } from '@/lib/timeline'
import { getArchiveSummary, getDefaultLot, getObjectDetail, type ObjectDetail } from '@/server/archive'
import { getCurrentUser } from '@/server/auth'
import { listTimeline, searchObjects, type TimelineSort } from '@/server/objects'
import { listPeopleWithCounts } from '@/server/people'
import { TimelineKeys } from './keys'
import { Rail } from './rail'
import { Stream } from './stream'

export const metadata: Metadata = { title: 'Timeline — Capsule' }

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string; q?: string; edit?: string; sort?: string }>
}) {
  // getCurrentUser, not auth(): it also creates the users row on first sight.
  // Every foreign key points at users.id, so an authed page that skips this
  // renders an empty archive and then FK-fails on the first object added.
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const userId = user.id

  const { lot, q, edit, sort } = await searchParams
  const requested = Number.parseInt(lot ?? '', 10)
  const query = q?.trim() || null
  const editing = edit === '1'
  const order: TimelineSort = sort === 'oldest' ? 'oldest' : 'newest'

  const [summary, people, rows] = await Promise.all([
    getArchiveSummary(userId),
    listPeopleWithCounts(userId),
    query ? searchObjects(userId, query) : listTimeline(userId, { sort: order }),
  ])

  const activeLot = Number.isNaN(requested) ? await getDefaultLot(userId) : requested
  const detail = activeLot === null ? null : await getObjectDetail(userId, activeLot)

  return (
    <div data-surface="ledger" className="safe-t safe-x flex h-dvh overflow-hidden bg-bg text-ink">
      <TiltLayer />
      <TimelineKeys
        lots={rows.map((row) => row.object.lotNo)}
        activeLot={detail?.lotNo ?? null}
        query={query}
        sort={order}
        editing={editing}
      />
      <Rail summary={summary} people={people} />

      <main className="flex min-w-0 flex-1 flex-col">
        <h1 className="sr-only">Timeline</h1>
        <Toolbar
          total={summary.objects}
          query={query}
          sort={order}
          activeLot={detail?.lotNo ?? null}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {query ? (
            <SearchResults rows={rows} query={query} activeLot={detail?.lotNo ?? null} />
          ) : (
            <Stream rows={rows} activeLot={detail?.lotNo ?? null} sort={order} />
          )}
        </div>
      </main>

      {detail ? (
        editing ? (
          <DetailEdit detail={detail} query={query} sort={order} />
        ) : (
          <Detail detail={detail} query={query} sort={order} />
        )
      ) : null}
    </div>
  )
}

function Toolbar({
  total,
  query,
  sort,
  activeLot,
}: {
  total: number
  query: string | null
  sort: TimelineSort
  activeLot: number | null
}) {
  const flipped = sort === 'newest' ? 'oldest' : 'newest'
  // Keeps the selection across a re-sort — the object is still there, just at a
  // different point in the run, and losing the inspector on every sort is worse
  // than a slightly longer URL.
  const sortHref = timelineHref({ lot: activeLot, q: query, sort: flipped })

  return (
    <div className="flex h-14 shrink-0 items-center gap-3.5 border-b border-hair px-6">
      <form action="/timeline" className="mn flex h-[30px] max-w-[330px] flex-1 items-center gap-2 rounded-[7px] border border-hair-strong bg-paper px-3 text-[10.5px]">
        {sort === 'oldest' ? <input type="hidden" name="sort" value="oldest" /> : null}
        <span aria-hidden className="opacity-50">
          ⌕
        </span>
        <input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder={`search ${countLine([total, 'object']).toLowerCase()}`}
          title="Search — ⌘K or /"
          className="w-full bg-transparent outline-none placeholder:text-mute-2"
        />
      </form>

      <div className="ml-auto flex gap-1.5">
        {/* searchObjects orders by received_at desc and takes no sort, so while a
            search is live the control would flip its own label and the URL while
            changing nothing about the results. */}
        {query ? null : (
        <Link
          href={sortHref}
          aria-label={`Sorted ${sort === 'newest' ? 'newest' : 'oldest'} first. Show ${flipped} first.`}
          className="mn rounded-md border border-hair-strong px-[11px] py-1.5 text-[9px] tracking-[0.08em] text-mute-1 hover:text-ink"
        >
          {sort === 'newest' ? 'NEWEST' : 'OLDEST'}
        </Link>
        )}
        <Link
          href="/accession"
          title="Add photographs — N"
          className="mn rounded-md bg-ink px-[11px] py-1.5 text-[9px] font-medium tracking-[0.08em] text-bg"
        >
          + ADD OBJECT
        </Link>
      </div>
    </div>
  )
}

function Hero({ detail }: { detail: ObjectDetail }) {
  const recto = detail.faces.find((face) => face.role === 'recto') ?? detail.faces[0]
  const aspect = aspectOf(recto?.width, recto?.height)
  return (
    <Cutout
      width={cutoutWidth(detail.silhouette as Silhouette, aspect, { min: 150, max: 216 })}
      silhouette={detail.silhouette as Silhouette}
      cut={detail.cutStyle as CutStyle}
      rotate={detail.rotationDeg}
      aspect={aspect}
      src={recto?.cutoutUrl ?? undefined}
      eager
      alt={detail.title}
      label={recto?.cutoutUrl ? undefined : (detail.kind ?? undefined)}
      interactive
    />
  )
}

function Detail({
  detail,
  query,
  sort,
}: {
  detail: ObjectDetail
  query: string | null
  sort: TimelineSort
}) {
  return (
    <Inspector
      hero={<Hero detail={detail} />}
      lot={
        <Link href={`/o/${detail.lotNo}`} className="underline-offset-4 hover:underline">
          {lotLabel(detail.lotNo)}
        </Link>
      }
      aside={
        <Link
          href={timelineHref({ lot: detail.lotNo, q: query, sort, edit: true })}
          className="text-mute-1 underline-offset-4 hover:text-ink hover:underline"
        >
          EDIT
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

/**
 * The inspector, writable.
 *
 * Adding a date to an already-filed object used to mean leaving the Ledger for
 * /o/[lot] — a 430px phone column on a desktop screen — pressing EDIT, and
 * hand-typing an ISO string, six steps from a panel that was already showing
 * the field. This edits it where it is read.
 *
 * Retention and tags stay outside the form and keep working live: they are
 * their own actions, and nesting them would make their buttons submit this one.
 */
function DetailEdit({
  detail,
  query,
  sort,
}: {
  detail: ObjectDetail
  query: string | null
  sort: TimelineSort
}) {
  const giver = detail.givenBy.map((p) => p.name).join(', ')

  return (
    <Inspector
      action={saveFieldsAction.bind(null, detail.id)}
      hero={<Hero detail={detail} />}
      lot={lotLabel(detail.lotNo)}
      aside={
        <Link
          href={timelineHref({ lot: detail.lotNo, q: query, sort })}
          className="text-mute-1 underline-offset-4 hover:text-ink hover:underline"
        >
          CANCEL
        </Link>
      }
      // Plain text, not the title input. Inspector renders this inside an <h2>,
      // and a heading whose only content is a form control has no accessible
      // name at all — on the branch that added the headings. The title is edited
      // as its own row below, like every other field.
      title={detail.title}
      rows={
        <FieldRowsEdit
          rows={[
            { label: 'Title', name: 'title', defaultValue: detail.title, placeholder: 'Untitled' },
            { label: 'From', name: 'givenBy', defaultValue: giver, placeholder: 'Who gave it to you?' },
            { label: 'Received', name: 'receivedAt', defaultValue: detail.receivedAt, type: 'date' },
            { label: 'Origin', name: 'place', defaultValue: detail.placeName, placeholder: 'Where from?' },
            {
              label: 'Occasion',
              name: 'occasion',
              defaultValue: detail.occasionName,
              placeholder: 'What was the occasion?',
            },
          ]}
        />
      }
      story={
        <>
          {/* Hidden fields live here rather than in the title slot: that slot is
              rendered inside the panel's <h2>. The action rebuilds the
              destination from lotNo, so these only say which surface asked and
              cannot become an open redirect. */}
          <input type="hidden" name="returnTo" value="timeline" />
          <input type="hidden" name="returnQ" value={query ?? ''} />
          <input type="hidden" name="returnSort" value={sort} />
          <textarea
            name="story"
            defaultValue={detail.story ?? ''}
            rows={4}
            placeholder="Say one sentence and move on…"
            aria-label="The story"
            className="w-full resize-none border-b border-transparent bg-transparent text-[12.5px] leading-[1.6] text-mute-1 outline-none transition-colors focus:border-hair-strong placeholder:text-mute-3"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="mn flex-1 rounded-md bg-ink py-2 text-[9px] font-medium tracking-[0.1em] text-bg"
            >
              SAVE
            </button>
            <Link
              href={timelineHref({ lot: detail.lotNo, q: query, sort })}
              className="mn flex-1 rounded-md border border-hair-strong py-2 text-center text-[9px] tracking-[0.1em] text-mute-1"
            >
              CANCEL
            </Link>
          </div>
        </>
      }
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
                href={timelineHref({ lot: object.lotNo, q: query })}
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
