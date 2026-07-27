import 'server-only'

import { eq } from 'drizzle-orm'

import { deleteBlobs } from './blob'
import { getDb } from './db'
import {
  intakeBatches,
  intakeItems,
  objectFaces,
  objects,
  ownerCounters,
  users,
} from './db/schema'

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

/**
 * Deletes an account and every byte behind it.
 *
 * This is the only deletion path a real person can trigger — Clerk's
 * `user.deleted` webhook — and the FK cascade wipes objects, object_faces,
 * intake_batches and intake_items, i.e. every row that holds a blob URL. Doing
 * that alone would leave the account's entire photographic archive sitting in
 * both Blob stores with nothing left pointing at it: unreachable, unbilled to
 * anyone who could delete it, and still there. "Delete my account" has to mean
 * the photographs are gone.
 *
 * Blobs go first, best-effort, for the same reason as deleteObject: a leaked
 * blob is recoverable by a sweep, a half-deleted account is not.
 */
export async function deleteUser(id: string) {
  const db = getDb()

  const [faces, items] = await Promise.all([
    db
      .select({
        originalUrl: objectFaces.originalUrl,
        cutoutUrl: objectFaces.cutoutUrl,
        thumbUrl: objectFaces.thumbUrl,
        maskUrl: objectFaces.maskUrl,
      })
      .from(objectFaces)
      .innerJoin(objects, eq(objects.id, objectFaces.objectId))
      .where(eq(objects.ownerId, id)),
    db
      .select({ originalUrl: intakeItems.originalUrl, cutoutUrl: intakeItems.cutoutUrl })
      .from(intakeItems)
      .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
      .where(eq(intakeBatches.ownerId, id)),
  ])

  await deleteBlobs({
    originals: [...faces.map((f) => f.originalUrl), ...items.map((i) => i.originalUrl)],
    media: [
      ...faces.flatMap((f) => [f.cutoutUrl, f.thumbUrl, f.maskUrl]),
      ...items.map((i) => i.cutoutUrl),
    ],
  })

  await db.delete(users).where(eq(users.id, id))
}

export async function getUser(ownerId: string) {
  const rows = await getDb().select().from(users).where(eq(users.id, ownerId)).limit(1)
  return rows[0] ?? null
}
