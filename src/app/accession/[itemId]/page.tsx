import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { getIntakeItem } from '@/server/intake'
import type { Corner } from '@/server/derive'
import { CornerEditor } from './editor'

export const metadata: Metadata = { title: 'Cut out — Capsule' }

export default async function CutPage({ params }: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const { itemId } = await params
  const item = await getIntakeItem(user.id, itemId)
  if (!item?.originalUrl) notFound()

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-6">
        <nav className="flex h-11 shrink-0 items-center justify-between">
          <Link href="/queue" className="text-[13px] text-mute-2">
            Cancel
          </Link>
          <span className="mn text-[9px] tracking-[0.14em] text-mute-2">CUT OUT</span>
          <span className="w-10" />
        </nav>

        <div className="pt-4 pb-10">
          <CornerEditor itemId={item.id} initialCorners={item.corners as Corner[] | null} />
        </div>
      </div>
    </div>
  )
}
