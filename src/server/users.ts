import 'server-only'

import { eq } from 'drizzle-orm'

import { getDb } from './db'
import { ownerCounters, users } from './db/schema'

export type UpsertUserInput = {
  id: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}

export async function upsertUser({ id, email, displayName, avatarUrl }: UpsertUserInput) {
  const db = getDb()

  await db
    .insert(users)
    .values({ id, email, displayName, avatarUrl })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, displayName, avatarUrl, updatedAt: new Date() },
    })

  await db.insert(ownerCounters).values({ ownerId: id }).onConflictDoNothing()
}

export async function deleteUser(id: string) {
  await getDb().delete(users).where(eq(users.id, id))
}

export async function getUser(ownerId: string) {
  const rows = await getDb().select().from(users).where(eq(users.id, ownerId)).limit(1)
  return rows[0] ?? null
}
