import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Hairline, TiltLayer, type CutStyle, type Silhouette } from '@/design'
import { lotLabel, plural, receivedLabel } from '@/lib/format'
import { getObjectDetail } from '@/server/archive'
import { getCurrentUser } from '@/server/auth'
import { getPersonStats } from '@/server/people'
import { saveFieldsAction } from '@/server/actions/objects'
import { RetentionControl } from '@/components/retention-control'
import { ShareButton } from '@/components/share-button'
import { Tags } from '@/components/tag-editor'
import { Faces } from './faces'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lot: string }>
}): Promise<Metadata> {
  const { lot } = await params
  return { title: `${lotLabel(Number(lot))} — Capsule` }
}

export default async function ObjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ lot: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [{ lot }, { edit }] = await Promise.all([params, searchParams])
  const lotNo = Number.parseInt(lot, 10)
  if (Number.isNaN(lotNo)) notFound()

  const detail = await getObjectDetail(user.id, lotNo)
  if (!detail) notFound()

  const giver = detail.givenBy[0]
  const stats = giver ? await getPersonStats(user.id, giver.id) : null

  const meta = [
    giver?.name,
    receivedLabel(detail.receivedAt, detail.receivedPrecision),
    detail.placeName,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <TiltLayer />

      {/* The object view is the phone screen in the doc; on a wide window it
          stays a single column rather than inventing a desktop layout that the
          design never specified. */}
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
        <nav className="flex h-11 shrink-0 items-center justify-between border-b border-hair px-4">
          <Link href="/timeline" aria-label="Back to timeline" className="text-[15px] text-mute-2">
            ‹
          </Link>
          <span className="mn text-[9px] tracking-[0.14em] text-mute-2">
            {lotLabel(detail.lotNo)}
          </span>
          <span className="flex items-center gap-3">
            {edit ? null : <ShareButton objectId={detail.id} />}
            <Link
              href={edit ? `/o/${lotNo}` : `/o/${lotNo}?edit=1`}
              className="mn text-[9px] tracking-[0.1em] text-mute-2"
            >
              {edit ? 'DONE' : 'EDIT'}
            </Link>
          </span>
        </nav>

        {edit ? (
          <EditForm detail={detail} giverName={giver?.name ?? ''} lotNo={lotNo} />
        ) : (
          <>
            <Faces
              faces={detail.faces.map((face) => ({
                id: face.id,
                role: face.role,
                cutoutUrl: face.cutoutUrl,
                width: face.width,
                height: face.height,
              }))}
              silhouette={detail.silhouette as Silhouette}
              cut={detail.cutStyle as CutStyle}
              rotate={detail.rotationDeg}
              title={detail.title}
              kind={detail.kind}
            />

            <div className="px-6">
              <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
                {detail.title}
              </h1>
              {meta ? (
                <div className="mn mt-[9px] text-[9.5px] tracking-[0.1em] uppercase text-mute-2">
                  {meta}
                </div>
              ) : null}

              {detail.story ? (
                <p className="mt-4 text-[14px] leading-[1.6] text-pretty text-mute-1">
                  {detail.story}
                </p>
              ) : null}

              <div className="mt-5">
                <RetentionControl
                  objectId={detail.id}
                  value={detail.retention}
                  location={detail.retainedLocation}
                  variant="pill"
                />
              </div>

              <div className="mt-3.5">
                <Tags objectId={detail.id} tags={detail.tags} />
              </div>
            </div>

            {stats && stats.objectCount > 1 ? (
              <footer className="mt-auto flex items-center justify-between border-t border-hair px-4 py-3.5">
                <div>
                  <div className="text-[12px] leading-[1.2] font-medium">
                    {stats.objectCount - 1} more from {stats.name}
                  </div>
                  <div className="mn mt-[3px] text-[8.5px] tracking-[0.06em] text-mute-2">
                    {stats.firstYear && stats.lastYear
                      ? stats.firstYear === stats.lastYear
                        ? stats.firstYear
                        : `${stats.firstYear} — ${stats.lastYear}`
                      : `${stats.objectCount} ${plural(stats.objectCount, 'object')}`}
                  </div>
                </div>
                <Link
                  href={`/people/${giver!.id}`}
                  className="mn rounded-lg bg-ink px-3.5 py-2.5 text-[9px] tracking-[0.1em] text-bg"
                >
                  SEE ALL
                </Link>
              </footer>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  textarea,
}: {
  label: string
  name: string
  defaultValue?: string | null
  placeholder?: string
  textarea?: boolean
}) {
  const shared =
    'mt-2 w-full border-0 border-b border-hair-strong bg-transparent pb-2 text-[14px] outline-none placeholder:text-mute-3 focus:border-ink'
  return (
    <label className="block">
      <span className="mn text-[9px] tracking-[0.14em] uppercase text-mute-2">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          rows={4}
          defaultValue={defaultValue ?? ''}
          placeholder={placeholder}
          className={`${shared} resize-none leading-[1.6]`}
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue ?? ''}
          placeholder={placeholder}
          className={shared}
        />
      )}
    </label>
  )
}

function EditForm({
  detail,
  giverName,
  lotNo,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getObjectDetail>>>
  giverName: string
  lotNo: number
}) {
  return (
    <form action={saveFieldsAction.bind(null, detail.id)} className="flex flex-col gap-5 px-6 py-6">
      <Field label="Title" name="title" defaultValue={detail.title} />
      <Field label="From" name="givenBy" defaultValue={giverName} placeholder="Who gave it to you?" />
      <Field
        label="Received"
        name="receivedAt"
        defaultValue={detail.receivedAt}
        placeholder="YYYY-MM-DD"
      />
      <Field label="Origin" name="place" defaultValue={detail.placeName} placeholder="Where from?" />
      <Field
        label="Occasion"
        name="occasion"
        defaultValue={detail.occasionName}
        placeholder="What was the occasion?"
      />
      <Field
        label="The story"
        name="story"
        defaultValue={detail.story}
        placeholder="Say one sentence and move on…"
        textarea
      />
      <Field
        label="Where it lives"
        name="retainedLocation"
        defaultValue={detail.retainedLocation}
        placeholder="In the blue tin, top shelf"
      />

      <Hairline />

      <RetentionControl
        objectId={detail.id}
        value={detail.retention}
        location={detail.retainedLocation}
      />

      <div className="flex gap-2 pb-8">
        <Link
          href={`/o/${lotNo}`}
          className="flex h-11 flex-1 items-center justify-center rounded-[11px] border border-hair-strong text-[13px] font-medium"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="h-11 flex-1 rounded-[11px] bg-ink text-[13px] font-medium text-bg"
        >
          Save
        </button>
      </div>
    </form>
  )
}
