import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Chip,
  Cutout,
  FieldRows,
  Inspector,
  ShelfRule,
  TiltLayer,
  aspectOf,
  cutoutWidth,
  type CutStyle,
  type Silhouette,
} from '@/design'
import { PhoneLotSheet } from '@/components/phone-lot-sheet'
import { countLine, lotLabel, receivedLabel } from '@/lib/format'
import { getObjectDetail, getDefaultLot } from '@/server/archive'
import { getCurrentUser } from '@/server/auth'
import { getCabinet } from '@/server/cabinet'

export const metadata: Metadata = { title: 'Cabinet — Capsule' }

export default async function CabinetPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const { lot } = await searchParams
  const requested = Number.parseInt(lot ?? '', 10)

  const shelves = await getCabinet(user.id)
  const total = shelves.reduce((n, shelf) => n + shelf.objects.length, 0)
  const activeLot = Number.isNaN(requested) ? await getDefaultLot(user.id) : requested
  const detail = activeLot === null ? null : await getObjectDetail(user.id, activeLot)

  return (
    <div data-surface="cabinet" className="safe-t safe-x flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <h1 className="sr-only">Cabinet</h1>
      <TiltLayer />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hair px-4 lg:gap-[18px] lg:px-[26px]">
        <span className="mn text-[10.5px] font-semibold tracking-[0.24em]">CAPSULE</span>
        <span className="h-[18px] w-px bg-hair-strong max-lg:hidden" />
        <nav className="flex min-w-0 gap-0.5 max-lg:overflow-x-auto">
          <span className="mn shrink-0 rounded-md bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] px-[11px] py-1.5 text-[9px] tracking-[0.11em]">
            CABINET
          </span>
          {[
            ['CATALOGUE', '/catalogue'],
            ['PEOPLE', '/people'],
            ['LEDGER', '/timeline'],
            ['BOARD', '/board'],
          ].map(([name, href]) => (
            <Link
              key={name}
              href={href!}
              className="mn shrink-0 rounded-md px-[11px] py-1.5 text-[9px] tracking-[0.11em] text-mute-2"
            >
              {name}
            </Link>
          ))}
        </nav>
        <form
          action="/timeline"
          className="mn ml-auto flex h-[30px] min-w-[220px] items-center gap-2 rounded-[7px] border border-hair-strong px-[13px] text-[10.5px] max-lg:hidden"
        >
          <span className="opacity-55">⌕</span>
          <input
            type="search"
            name="q"
            placeholder="lot no., person, place"
            className="w-full bg-transparent outline-none placeholder:text-mute-3"
          />
        </form>
        <Link
          href="/accession"
          className="mn shrink-0 rounded-[7px] px-[13px] py-[7px] text-[9px] font-semibold tracking-[0.11em] max-lg:ml-auto"
          style={{ background: 'var(--btn)', color: 'var(--btn-ink)' }}
        >
          + ACCESSION
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        <main
          className="min-w-0 flex-1 overflow-y-auto px-4 pt-[26px] lg:px-[30px] lg:pt-[34px]"
          style={{
            background:
              'radial-gradient(90% 60% at 50% -10%, rgb(255 247 228 / 0.07), transparent 70%)',
          }}
        >
          {shelves.map((shelf, index) => (
            <section key={shelf.id}>
              <div className="mb-1 flex items-baseline gap-3">
                <span className="mn text-[9px] tracking-[0.18em] text-mute-2">
                  SHELF {ROMAN[index] ?? index + 1}
                </span>
                <span className="text-[13px] font-medium tracking-[-0.01em]">{shelf.name}</span>
                <span
                  className="mn ml-auto text-[9px] tracking-[0.1em]"
                  style={{ color: shelf.dim ? 'var(--accent)' : 'var(--mute-3)' }}
                >
                  {shelf.objects.length} {shelf.dim ? 'LOTS AWAITING ENTRY' : 'LOTS'}
                </span>
              </div>

              <div
                className="flex items-end gap-9 overflow-x-auto px-1.5 pt-3 pb-1"
                style={{ minHeight: 128, opacity: shelf.dim ? 0.55 : 1 }}
              >
                {shelf.objects.slice(0, 9).map((object) => {
                  const aspect = aspectOf(object.faceW, object.faceH)
                  const active = object.lotNo === detail?.lotNo
                  return (
                    <Link
                      key={object.id}
                      href={`/cabinet?lot=${object.lotNo}`}
                      scroll={false}
                      className="shrink-0"
                    >
                      <Cutout
                        width={cutoutWidth(object.silhouette as Silhouette, aspect, {
                          min: 56,
                          max: 150,
                        })}
                        silhouette={object.silhouette as Silhouette}
                        cut={object.cutStyle as CutStyle}
                        rotate={object.rotationDeg}
                        aspect={aspect}
                        src={object.cutoutUrl ?? undefined}
                        thumbSrc={object.thumbUrl ?? undefined}
                        alt={object.title}
                        label={object.cutoutUrl ? undefined : (object.kind ?? undefined)}
                        state={active ? 'active' : 'idle'}
                        interactive
                      />
                    </Link>
                  )
                })}
                {shelf.objects.length > 9 ? (
                  <span className="mn shrink-0 pb-1.5 text-[9px] tracking-[0.1em] text-mute-3">
                    + {shelf.objects.length - 9} MORE →
                  </span>
                ) : null}
              </div>

              <ShelfRule dim={shelf.dim} />
              <div className="h-[22px]" />
            </section>
          ))}

          <div className="mn pb-8 text-[8.5px] tracking-[0.14em] text-mute-3">
            {countLine([total, 'lot'])}
          </div>
        </main>

        {detail ? (
          <div className="hidden shrink-0 lg:flex">
          <Inspector
            width={344}
            hero={
              <Cutout
                width={200}
                silhouette={detail.silhouette as Silhouette}
                cut={detail.cutStyle as CutStyle}
                rotate={detail.rotationDeg}
                aspect={aspectOf(detail.faces[0]?.width, detail.faces[0]?.height)}
                src={detail.faces[0]?.cutoutUrl ?? undefined}
                eager
                alt={detail.title}
                label={
                  detail.faces.length > 1
                    ? 'recto · verso →'
                    : (detail.kind ?? undefined)
                }
                interactive
              />
            }
            lot={
              <Link href={`/o/${detail.lotNo}`} className="underline-offset-4 hover:underline">
                {lotLabel(detail.lotNo, 'lot')}
              </Link>
            }
            aside={
              detail.material || (detail.widthMm && detail.heightMm)
                ? [
                    detail.material?.toUpperCase(),
                    detail.widthMm && detail.heightMm
                      ? `${detail.widthMm} × ${detail.heightMm} MM`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
            }
            title={detail.title}
            rows={
              <FieldRows
                rows={[
                  {
                    label: 'Given by',
                    value: detail.givenBy.map((p) => p.name).join(', ') || null,
                  },
                  {
                    label: 'Accessioned',
                    value: receivedLabel(detail.receivedAt, detail.receivedPrecision) || null,
                    mono: true,
                  },
                  { label: 'Provenance', value: detail.placeName },
                  { label: 'Occasion', value: detail.occasionName },
                ]}
              />
            }
            story={detail.story}
            storyLabel="Note"
            footer={
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-[7px] rounded-full"
                  style={{
                    background: detail.retention === 'retained' ? 'var(--ok)' : 'var(--mute-3)',
                    boxShadow:
                      detail.retention === 'retained'
                        ? '0 0 8px color-mix(in srgb, var(--ok) 60%, transparent)'
                        : 'none',
                  }}
                />
                <span className="text-[12px] text-mute-1">
                  {detail.retention === 'retained'
                    ? 'Physical object retained'
                    : 'Digital record only'}
                </span>
                {detail.retainedLocation ? (
                  <span className="mn ml-auto text-[9px] tracking-[0.1em] uppercase text-mute-3">
                    {detail.retainedLocation}
                  </span>
                ) : null}
              </div>
            }
          >
            {detail.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <Chip key={tag.id}>{tag.name}</Chip>
                ))}
              </div>
            ) : null}
          </Inspector>
          </div>
        ) : null}
      </div>

      {/* Phone: the lit-vitrine sheet, only for an explicitly chosen lot. */}
      {detail && !Number.isNaN(requested) ? (
        <PhoneLotSheet detail={detail} closeHref="/cabinet" lotStyle="lot" />
      ) : null}
    </div>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
