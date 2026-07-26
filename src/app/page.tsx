import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'

import { SITE } from '@/lib/site'
import { getCurrentUser } from '@/server/auth'

export default async function Home() {
  const { userId } = await auth()
  const user = await getCurrentUser()

  return (
    <main className="min-h-dvh bg-[#fbf9f5] px-8 py-16 text-[#2a251d]">
      <div className="mx-auto max-w-lg">
        <div className="mn text-[10.5px] font-semibold tracking-[0.22em]">
          {SITE.name.toUpperCase()}
        </div>
        <div className="mn mt-1.5 text-[8.5px] tracking-[0.1em] text-[#2a251d]/40">
          0 OBJECTS · 0 PEOPLE
        </div>

        <hr className="my-8 border-0 border-t border-[#2a251d]/10" />

        <p className="max-w-prose text-pretty text-[13px] leading-relaxed text-[#2a251d]/70">
          {SITE.description} Who it was from, when, where it came from, the occasion, and the
          story. Nothing is here yet.
        </p>

        <hr className="my-8 border-0 border-t border-[#2a251d]/10" />

        {/* Phase 1 proof surface: Clerk session on the left, the row the webhook
            wrote into Neon on the right. Replaced by the real Ledger in phase 4. */}
        <dl className="text-[12.5px]">
          <div className="flex justify-between gap-4 border-t border-[#2a251d]/10 py-2.5">
            <dt className="mn text-[9px] tracking-[0.11em] text-[#2a251d]/40">SESSION</dt>
            <dd className="mn text-[11px]">{userId ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[#2a251d]/10 py-2.5">
            <dt className="mn text-[9px] tracking-[0.11em] text-[#2a251d]/40">DB ROW</dt>
            <dd className="mn text-[11px]">
              {user ? (user.email ?? user.id) : userId ? 'sync failed' : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-b border-[#2a251d]/10 py-2.5">
            <dt className="mn text-[9px] tracking-[0.11em] text-[#2a251d]/40">SYNCED AT</dt>
            <dd className="mn text-[11px]">
              {user ? user.updatedAt.toISOString().slice(0, 19).replace('T', ' ') : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          {userId ? (
            <SignOutButton>
              <button className="mn rounded-md border border-[#2a251d]/15 px-3 py-2 text-[9px] tracking-[0.1em] text-[#2a251d]/60">
                SIGN OUT
              </button>
            </SignOutButton>
          ) : (
            <Link
              href="/sign-in"
              className="mn inline-block rounded-md bg-[#2a251d] px-3 py-2 text-[9px] font-medium tracking-[0.1em] text-[#fbf9f5]"
            >
              SIGN IN
            </Link>
          )}
        </div>

        <div className="mn mt-8 text-[8.5px] tracking-[0.14em] text-[#2a251d]/35">
          PHASE 1 · PLATFORM WIRING
        </div>
      </div>
    </main>
  )
}
