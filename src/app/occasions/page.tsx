import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Hairline } from '@/design'
import { countLine } from '@/lib/format'
import { getCurrentUser } from '@/server/auth'
import { listOccasionsWithCounts } from '@/server/taxonomy'

export const metadata: Metadata = { title: 'Occasions — Capsule' }

export default async function OccasionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const occasions = await listOccasionsWithCounts(user.id)

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-[560px] px-6 pt-10 pb-16">
        <nav className="mb-8 flex items-baseline justify-between">
          <Link href="/timeline" className="text-[15px] text-mute-2">
            ‹
          </Link>
          <span className="mn text-[9px] tracking-[0.16em] text-mute-2">OCCASIONS</span>
          <span className="mn text-[9px] text-mute-3">{occasions.length}</span>
        </nav>

        <ul>
          {occasions.map((occasion, i) => (
            <li key={occasion.id}>
              {i > 0 ? <Hairline /> : null}
              <Link
                href={`/timeline?q=${encodeURIComponent(occasion.name)}`}
                className="flex items-baseline gap-3.5 py-3.5"
              >
                <span className="text-[14px] font-medium">{occasion.name}</span>
                <span className="mn ml-auto text-[9px] tracking-[0.08em] text-mute-2">
                  {countLine([occasion.objectCount, 'object'])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
