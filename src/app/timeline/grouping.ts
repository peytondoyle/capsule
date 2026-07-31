import type { listTimeline, TimelineSort } from '@/server/objects'

export type Rows = Awaited<ReturnType<typeof listTimeline>>
export type Row = Rows[number]

/**
 * Groups the timeline into years, then months.
 *
 * Objects whose date precision is 'year' have no honest month, so they collect
 * in a month-less run at the end of their year rather than being assigned to
 * January. Objects with no date at all never reach here — listTimeline excludes
 * them and they live in Unfiled.
 *
 * The grouping re-sorts, so it has to be told the direction. Ordering the query
 * alone did nothing: years and months were sorted descending here regardless of
 * the row order handed in, so `?sort=oldest` only ever flipped objects within a
 * single month run.
 *
 * Lives apart from stream.tsx so the gate can import it: stream.tsx pulls in
 * next/link, which cannot load under the react-server condition the scripts run
 * with. The gate asserting on the query instead of on this is exactly what let a
 * sort control ship that did not sort.
 */
export function group(rows: Rows, sort: TimelineSort) {
  const dir = sort === 'oldest' ? -1 : 1
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
    .sort((a, b) => (b[0] - a[0]) * dir)
    .map(([year, months]) => ({
      year,
      rows: [...months.values()].flat(),
      // Month 0 (year-only precision) sorts last either way — it is the absence
      // of a month, not an early one.
      months: [...months.entries()]
        .sort((a, b) => (a[0] === 0 ? 1 : b[0] === 0 ? -1 : (b[0] - a[0]) * dir))
        .map(([month, run]) => ({ month, run })),
    }))
}
