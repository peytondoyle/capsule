import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Hairline } from '@/design'
import { countLine, initialsOf } from '@/lib/format'
import { getCurrentUser } from '@/server/auth'
import { listPeopleWithCounts } from '@/server/people'

export const metadata: Metadata = { title: 'People — Capsule' }

export default async function PeoplePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const people = await listPeopleWithCounts(user.id)

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <h1 className="sr-only">Given by</h1>
      <div className="mx-auto max-w-[560px] px-6 pt-10 pb-16">
        <nav className="mb-8 flex items-baseline justify-between">
          <Link
            href="/timeline"
            aria-label="Back to the timeline"
            className="-ml-1.5 flex size-6 items-center justify-center text-[15px] text-mute-2"
          >
            ‹
          </Link>
          <span className="mn text-[9px] tracking-[0.16em] text-mute-2">GIVEN BY</span>
          <span className="mn text-[9px] text-mute-3">{people.length}</span>
        </nav>

        <ul>
          {people.map((person, i) => (
            <li key={person.id}>
              {i > 0 ? <Hairline /> : null}
              <Link
                href={`/people/${person.id}`}
                className="flex items-center gap-3.5 py-3.5"
              >
                <span
                  aria-hidden
                  className="mn flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: '#e7e0d3', color: '#6d6355' }}
                >
                  {initialsOf(person.name, person.initials)}
                </span>
                <span className="text-[14px] font-medium">{person.name}</span>
                <span className="mn ml-auto text-[9px] tracking-[0.08em] text-mute-2">
                  {countLine([person.objectCount, 'object'])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
