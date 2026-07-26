import 'server-only'

import { auth, currentUser } from '@clerk/nextjs/server'

import { getUser, upsertUser } from './users'

/**
 * Resolves the signed-in Clerk user to its row in Neon, creating the row on
 * first sight.
 *
 * The Clerk webhook alone is not enough to guarantee the row exists: webhook
 * delivery is asynchronous and can be delayed or dropped, and every foreign key
 * in the schema points at `users.id`. So the row is created synchronously here
 * on the cold path, and the webhook's job is narrowed to propagating later
 * `user.updated` / `user.deleted` events.
 *
 * The extra SELECT is one indexed primary-key lookup; the Clerk Backend API call
 * only happens the first time a given user is seen.
 */
export async function getCurrentUser() {
  const { userId } = await auth()
  if (!userId) return null

  const existing = await getUser(userId)
  if (existing) return existing

  const clerkUser = await currentUser()
  if (!clerkUser) return null

  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId,
  )
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')

  await upsertUser({
    id: clerkUser.id,
    email: primaryEmail?.emailAddress ?? null,
    displayName: name || clerkUser.username || null,
    avatarUrl: clerkUser.imageUrl ?? null,
  })

  return getUser(userId)
}
