import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { listPendingIntake } from '@/server/intake'
import { listUnfiled } from '@/server/objects'
import { listPeopleWithCounts } from '@/server/people'
import { listPlacesWithCounts } from '@/server/taxonomy'
import { Filer } from './filer'

export const metadata: Metadata = { title: 'Unfiled — Capsule' }

export default async function QueuePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [pending, people, places, unfiledObjects] = await Promise.all([
    listPendingIntake(user.id),
    listPeopleWithCounts(user.id),
    listPlacesWithCounts(user.id),
    listUnfiled(user.id),
  ])

  const items = pending.map((row) => ({
    id: row.item.id,
    cutoutUrl: row.item.cutoutUrl,
    suggestions: row.item.suggestions as Record<
      string,
      { value: string; confidence: number } | undefined
    > | null,
  }))

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <div className="safe-t safe-b mx-auto flex min-h-dvh max-w-[430px] flex-col px-5 pt-4">
        {items.length > 0 ? (
          <Filer
            items={items}
            people={people.map((p) => p.name)}
            places={places.map((p) => p.name)}
          />
        ) : (
          <Empty unfiledCount={unfiledObjects.length} />
        )}
      </div>
    </div>
  )
}

function Empty({ unfiledCount }: { unfiledCount: number }) {
  return (
    <div className="pt-20">
      <h1 className="text-[20px] leading-[1.2] font-semibold tracking-[-0.03em]">
        Nothing waiting
      </h1>
      <p className="mt-3 max-w-[40ch] text-[13.5px] leading-relaxed text-pretty text-mute-1">
        {unfiledCount > 0 ? (
          <>
            Every photograph has been filed. {unfiledCount} object
            {unfiledCount === 1 ? '' : 's'} in the archive still {unfiledCount === 1 ? 'has' : 'have'}{' '}
            no giver, place or date — they are waiting on you, not on the queue.
          </>
        ) : (
          'Every photograph has been filed, and nothing in the archive is missing its who, when or where.'
        )}
      </p>
      <div className="mt-8 flex gap-2">
        <Link
          href="/accession"
          className="mn flex h-11 flex-1 items-center justify-center rounded-[11px] bg-ink text-[10px] tracking-[0.14em] text-bg"
        >
          + ADD PHOTOGRAPHS
        </Link>
        <Link
          href="/timeline"
          className="mn flex h-11 flex-1 items-center justify-center rounded-[11px] border border-hair-strong text-[10px] tracking-[0.14em]"
        >
          TIMELINE
        </Link>
      </div>
    </div>
  )
}
