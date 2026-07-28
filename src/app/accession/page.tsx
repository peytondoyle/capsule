import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { hasOriginalsStore } from '@/server/blob'
import { listPendingIntake } from '@/server/intake'
import { Uploader } from './uploader'

export const metadata: Metadata = { title: 'Accession — Capsule' }

export default async function AccessionPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const pending = await listPendingIntake(user.id)
  const ready = hasOriginalsStore()

  return (
    <div data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-6">
        <nav className="flex h-11 shrink-0 items-center justify-between">
          <Link href="/timeline" aria-label="Back" className="-ml-1.5 flex size-6 items-center justify-center text-[15px] text-mute-2">
            ‹
          </Link>
          <span className="mn text-[9px] tracking-[0.16em] text-mute-2">ACCESSION</span>
          <span className="w-3" />
        </nav>

        <div className="pt-8">
          <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
            Photograph the thing
          </h1>
          <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-pretty text-mute-1">
            One object per photograph. Nothing else is required now — you can say who gave it to
            you and when later, and it will wait in Unfiled until you do.
          </p>

          <div className="mt-8">
            {ready ? (
              <Uploader ownerId={user.id} />
            ) : (
              <p className="mn rounded-[11px] border border-dashed border-hair-strong p-4 text-[9.5px] leading-relaxed tracking-[0.06em] text-accent">
                THE PRIVATE ORIGINALS STORE IS NOT CONNECTED, SO UPLOADS ARE DISABLED. SEE
                DOCS/HANDOFF.MD.
              </p>
            )}
          </div>

          {pending.length > 0 ? (
            <Link
              href="/queue"
              className="mn mt-10 inline-flex items-center gap-2 text-[9.5px] tracking-[0.1em] text-mute-2 underline decoration-hair-strong underline-offset-4"
            >
              {pending.length} ALREADY WAITING TO BE FILED
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
