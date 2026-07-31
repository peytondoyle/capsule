import Link from 'next/link'

import { Cutout, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'
import { countLine, dayMonthLabel, monthName } from '@/lib/format'
import type { TimelineSort } from '@/server/objects'
import { group, timelineHref, type Rows } from '@/lib/timeline'

export function Stream({
  rows,
  activeLot,
  sort,
}: {
  rows: Rows
  activeLot: number | null
  sort: TimelineSort
}) {
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
      {years.map(({ year, rows: yearRows, months }, yearIndex) => {
        const givers = new Set(yearRows.map((r) => r.giver).filter(Boolean))
        return (
          <section key={year}>
            <header className="flex items-baseline gap-3 border-b border-hair-strong pb-3">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{year}</h2>
              <span className="mn text-[9px] tracking-[0.1em] text-mute-2">
                {countLine([yearRows.length, 'object'], [givers.size, 'person'])}
              </span>
            </header>

            {months.map(({ month, run }, monthIndex) => (
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
                  {run.map(({ object, recto, giver }, itemIndex) => {
                    // The first run of the first year is the fold. Lazy-loading
                    // what is already on screen costs a frame and buys nothing;
                    // everything below it is the actual saving.
                    const aboveFold = yearIndex === 0 && monthIndex === 0 && itemIndex < 12
                    const active = object.lotNo === activeLot
                    const aspect = aspectOf(recto?.width, recto?.height)
                    const width = cutoutWidth(object.silhouette as Silhouette, aspect)

                    return (
                      // The item box is wider than its cutout so the caption
                      // gets a real measure — the doc's 82px matchbook sits in
                      // a 120px column.
                      <li key={object.id} style={{ width: Math.max(width + 26, 118) }}>
                        <Link
                          href={timelineHref({ lot: object.lotNo, sort })}
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
                            thumbSrc={recto?.thumbUrl ?? undefined}
                            alt={object.title}
                            label={recto?.cutoutUrl ? undefined : (object.kind ?? undefined)}
                            state={active ? 'active' : 'idle'}
                            eager={aboveFold}
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
