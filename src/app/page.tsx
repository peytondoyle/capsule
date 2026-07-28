import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

/**
 * The bare domain is a signpost, not a screen.
 *
 * This was the phase-1 platform-wiring proof surface — a SESSION / DB ROW /
 * SYNCED AT table printing the Clerk id, over a hardcoded "0 OBJECTS · 0
 * PEOPLE" — and every sign-in path still lands here, so it shipped as the first
 * thing anyone saw. Redirecting rather than pointing the sign-in paths at
 * /timeline keeps the entry point correct however it is reached.
 *
 * Stays public by not calling auth.protect(): a signed-out visitor is sent to
 * sign in rather than refused.
 */
export default async function Home() {
  const { userId } = await auth()
  redirect(userId ? '/timeline' : '/sign-in')
}
