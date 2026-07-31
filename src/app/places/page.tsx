import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BackLink, Hairline } from '@/design'
import { countLine } from '@/lib/format'
import { getCurrentUser } from '@/server/auth'
import { listPlacesWithCounts } from '@/server/taxonomy'

export const metadata: Metadata = { title: 'Places — Capsule' }

export default async function PlacesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const places = await listPlacesWithCounts(user.id)

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <h1 className="sr-only">Places</h1>
      <div className="mx-auto max-w-[560px] px-6 pt-10 pb-16">
        <nav className="mb-8 flex items-baseline justify-between">
          <BackLink href="/timeline" label="Back to the timeline" />
          <span className="mn text-[9px] tracking-[0.16em] text-mute-2">PLACES</span>
          <span className="mn text-[9px] text-mute-3">{places.length}</span>
        </nav>

        <ul>
          {places.map((place, i) => (
            <li key={place.id}>
              {i > 0 ? <Hairline /> : null}
              <Link
                href={`/timeline?q=${encodeURIComponent(place.name)}`}
                className="flex items-baseline gap-3.5 py-3.5"
              >
                <span className="text-[14px] font-medium">{place.name}</span>
                {place.lat !== null ? (
                  <span className="mn text-[8.5px] tracking-[0.06em] text-mute-3">
                    {place.lat.toFixed(2)}, {place.lng?.toFixed(2)}
                  </span>
                ) : null}
                <span className="mn ml-auto text-[9px] tracking-[0.08em] text-mute-2">
                  {countLine([place.objectCount, 'object'])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
