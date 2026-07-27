import Link from 'next/link'

import { Cutout, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import { countLine, dayMonthLabel, monthName } from '@/lib/format'
import type { listTimeline } from '@/server/objects'

type Rows = Awaited<ReturnType<typeof listTimeline>>
type Row = Rows[number]

/**
 * Groups the timeline into years, then months.
 *
 * Objects whose date precision is 'year' have no honest month, so they collect
 * in a month-less run at the end of their year rather than being assigned to
 * January. Objects with no date at all never reach here — listTimeline excludes
 * them and they live in Unfiled.
 */
function group(rows: Rows) {
  const years = new Map<number, Map<number, Row[]>>()

  for (const row of rows) {
    const received = row.object.receivedAt
    if (!received) continue
    const [y, m] = received.slice(0, 10).split('-').map(Number)
    if (!y) continue

    const monthKey = row.object.receivedPrecision === 'year' ? 0 : (m ?? 0)
    const months = years.get(y) ?? new Map<number, Row[]>()
    const run = months.get(monthKey) ?? []
    run.push(row)
    months.set(monthKey, run)
    years.set(y, months)
  }

  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      rows: [...months.values()].flat(),
      // Month 0 (year-only precision) sorts last, the rest newest-first.
      months: [...months.entries()]
        .sort((a, b) => (a[0] === 0 ? 1 : b[0] === 0 ? -1 : b[0] - a[0]))
        .map(([month, run]) => ({ month, run })),
    }))
}

export function Stream({ rows, activeLot }: { rows: Rows; activeLot: number | null }) {
  const years = group(rows)

  if (years.length === 0) {
    return (
      <div className="px-6 pt-16">
        <p className="max-w-[42ch] text-[13px] leading-relaxed text-pretty text-mute-1">
          Nothing dated yet. Objects appear here once you say when they arrived — until then
          they wait in Unfiled.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 pt-[26px]">
      {years.map(({ year, rows: yearRows, months }) => {
        const givers = new Set(yearRows.map((r) => r.giver).filter(Boolean))
        return (
          <section key={year}>
            <header className="flex items-baseline gap-3 border-b border-hair-strong pb-3">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{year}</h2>
              <span className="mn text-[9px] tracking-[0.1em] text-mute-2">
                {countLine([yearRows.length, 'object'], [givers.size, 'person'])}
              </span>
            </header>

            {months.map(({ month, run }) => (
              <div key={month}>
                {month > 0 ? (
                  <div className="mn mt-4 mb-1.5 text-[8.5px] tracking-[0.14em] text-mute-3">
                    {monthName(month)}
                  </div>
                ) : (
                  <div className="mn mt-4 mb-1.5 text-[8.5px] tracking-[0.14em] text-mute-3">
                    SOMETIME THIS YEAR
                  </div>
                )}

                <ul className="flex flex-wrap items-start gap-[30px] px-1 pt-2 pb-[22px]">
                  {run.map(({ object, recto, giver }) => {
                    const active = object.lotNo === activeLot
                    const aspect = aspectOf(recto?.width, recto?.height)
                    const width = cutoutWidth(object.silhouette as Silhouette, aspect)

                    return (
                      // The item box is wider than its cutout so the caption
                      // gets a real measure — the doc's 82px matchbook sits in
                      // a 120px column.
                      <li key={object.id} style={{ width: Math.max(width + 26, 118) }}>
                        <Link
                          href={`/timeline?lot=${object.lotNo}`}
                          scroll={false}
                          aria-current={active ? 'true' : undefined}
                          className="block rounded-[3px] focus-visible:outline-2"
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
                          <div className="mt-3">
                            <div
                              className={[
                                'text-[12px] leading-[1.3] tracking-[-0.01em]',
                                active ? 'font-semibold' : 'font-medium',
                              ].join(' ')}
                            >
                              {object.title}
                            </div>
                            <div
                              className={[
                                'mn mt-[3px] text-[8.5px] tracking-[0.06em] uppercase',
                                active ? 'text-accent' : 'text-mute-2',
                              ].join(' ')}
                            >
                              {[giver?.toUpperCase(), dayMonthLabel(object.receivedAt, object.receivedPrecision)]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
