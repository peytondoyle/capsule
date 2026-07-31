import type { listTimeline, TimelineSort } from '@/server/objects'

export type Rows = Awaited<ReturnType<typeof listTimeline>>
type Row = Rows[number]

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
 * Lives in src/lib rather than beside stream.tsx for two reasons: stream.tsx
 * pulls in next/link, which cannot load under the react-server condition the
 * gates run with — and a gate reaching into src/app/** couples the proof to App
 * Router file layout. src/lib is the existing home for "how server data is
 * presented" (see format.ts) and is script-safe by convention.
 */
export function group(rows: Rows) {
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

  // Insertion order, which is the order listTimeline returned. This function
  // used to re-sort years and months descending regardless of what it was
  // handed, so ordering the query changed nothing anyone could see and the sort
  // control was decorative. Taking a direction here would have fixed it while
  // leaving two places that must agree about which way round the Ledger goes;
  // deferring to the rows makes disagreeing impossible instead.
  return [...years.entries()].map(([year, months]) => ({
    year,
    rows: [...months.values()].flat(),
    // The one rule that is not the rows' to decide: month 0 is year-only
    // precision, the *absence* of a month, so it trails its year either way
    // rather than posing as January or December.
    months: [...months.entries()]
      .sort((a, b) => (a[0] === 0 ? 1 : b[0] === 0 ? -1 : 0))
      .map(([month, run]) => ({ month, run })),
  }))
}

/**
 * The one spelling of a Ledger URL.
 *
 * `lot`, `q`, `sort` and `edit` are all URL state, and every link that rebuilds
 * a timeline address has to carry all of them — the toolbar, the stream, the
 * search results, the inspector and the post-save redirect. Five hand-rolled
 * copies is how `?sort` ended up being silently dropped by the one that was
 * written first.
 *
 * Pure and dependency-free, so the Server Action can import it without crossing
 * the src/server boundary.
 */
export function timelineHref({
  lot,
  q,
  sort,
  edit,
}: {
  lot?: number | null
  q?: string | null
  sort?: TimelineSort
  edit?: boolean
} = {}) {
  const params = new URLSearchParams()
  if (lot !== null && lot !== undefined) params.set('lot', String(lot))
  if (q) params.set('q', q)
  // Only the non-default is worth carrying; a bare /timeline means NEWEST.
  if (sort === 'oldest') params.set('sort', 'oldest')
  if (edit) params.set('edit', '1')
  const query = params.toString()
  return query ? `/timeline?${query}` : '/timeline'
}
