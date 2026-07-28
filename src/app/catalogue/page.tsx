import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { countLine, lotLabel, receivedLabel } from '@/lib/format'
import { getCurrentUser } from '@/server/auth'
import { getCatalogue } from '@/server/cabinet'

export const metadata: Metadata = { title: 'Catalogue — Capsule' }

/**
 * The Cabinet's CATALOGUE tab: every lot as a row.
 *
 * Nearly the whole screen is data, so nearly the whole screen is mono and
 * tabular — lot numbers and dates in a column only read as a catalogue if the
 * digits line up. Titles stay in prose; they are the only human thing here.
 */
export default async function CataloguePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const rows = await getCatalogue(user.id)

  return (
    <div data-surface="cabinet" className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <h1 className="sr-only">Catalogue</h1>
      <header className="flex h-14 shrink-0 items-center gap-[18px] border-b border-hair px-[26px]">
        <span className="mn text-[10.5px] font-semibold tracking-[0.24em]">CAPSULE</span>
        <span className="h-[18px] w-px bg-hair-strong" />
        <nav className="flex gap-0.5">
          <Link
            href="/cabinet"
            className="mn rounded-md px-[11px] py-1.5 text-[9px] tracking-[0.11em] text-mute-2"
          >
            CABINET
          </Link>
          <span className="mn rounded-md bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] px-[11px] py-1.5 text-[9px] tracking-[0.11em]">
            CATALOGUE
          </span>
          <Link
            href="/people"
            className="mn rounded-md px-[11px] py-1.5 text-[9px] tracking-[0.11em] text-mute-2"
          >
            PEOPLE
          </Link>
        </nav>
        <span className="mn ml-auto text-[9px] tracking-[0.1em] text-mute-3">
          {countLine([rows.length, 'lot'])}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-6">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hair-strong">
              {(
                [
                  ['Lot', false],
                  ['Object', false],
                  ['Given by', false],
                  ['Accessioned', false],
                  ['Provenance', false],
                  ['Material', false],
                  // The retention column had no header at all. It gets a real
                  // one, hidden — the design has no room for a seventh label.
                  ['Kept', true],
                ] as const
              ).map(([label, hidden]) => (
                <th
                  key={label}
                  scope="col"
                  className="mn pb-2.5 text-[8.5px] font-normal tracking-[0.14em] uppercase text-mute-3"
                >
                  <span className={hidden ? 'sr-only' : undefined}>{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-hair">
                <td className="mn py-2.5 text-[10.5px] whitespace-nowrap text-accent">
                  {lotLabel(row.lotNo, 'lot')}
                </td>
                <td className="py-2.5 pr-6 text-[12.5px] font-medium">
                  <Link href={`/o/${row.lotNo}`} className="hover:underline underline-offset-4">
                    {row.title}
                  </Link>
                </td>
                <td className="py-2.5 pr-6 text-[12px] text-mute-1">{row.giver ?? em()}</td>
                <td className="mn py-2.5 pr-6 text-[10.5px] whitespace-nowrap text-mute-1">
                  {receivedLabel(row.receivedAt, row.receivedPrecision) || em()}
                </td>
                <td className="py-2.5 pr-6 text-[12px] text-mute-1">{row.placeName ?? em()}</td>
                <td className="mn py-2.5 pr-6 text-[10px] uppercase text-mute-2">
                  {row.material ?? row.kind?.replace('_', ' ') ?? em()}
                </td>
                <td className="py-2.5">
                  {/* ARIA prohibits a name on a bare span, so the dot was
                      conveying kept-vs-not by colour alone. The dot is now
                      decoration and the state is real text. */}
                  <span className="sr-only">
                    {row.retention === 'retained' ? 'Kept' : 'Digital only'}
                  </span>
                  <span
                    aria-hidden
                    className="block size-[6px] rounded-full"
                    style={{
                      background:
                        row.retention === 'retained' ? 'var(--ok)' : 'var(--mute-3)',
                      boxShadow:
                        row.retention === 'retained'
                          ? '0 0 6px color-mix(in srgb, var(--ok) 60%, transparent)'
                          : 'none',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function em() {
  return '—'
}
