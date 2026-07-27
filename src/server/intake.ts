import 'server-only'

import { and, asc, eq, inArray } from 'drizzle-orm'

import { getDb } from './db'
import { intakeBatches, intakeItems, objectFaces } from './db/schema'
import { createObject } from './objects'
import { assertOwnedOriginalUrl } from './blob'
import { silhouetteForKind } from '@/design/silhouettes'

export type IntakeSuggestions = Partial<
  Record<'kind' | 'title' | 'place' | 'date' | 'occasion', { value: string; confidence: number }>
>

export async function createBatch(
  ownerId: string,
  source: 'camera' | 'share_target' | 'files' = 'files',
) {
  const [row] = await getDb().insert(intakeBatches).values({ ownerId, source }).returning()
  return row!
}

async function assertBatchOwned(ownerId: string, batchId: string) {
  const [row] = await getDb()
    .select({ id: intakeBatches.id })
    .from(intakeBatches)
    .where(and(eq(intakeBatches.id, batchId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  if (!row) throw new Error('batch not found')
  return row
}

/**
 * Records bytes that have already landed in Blob.
 *
 * The upload happens client-to-Blob, so this is the first moment the server
 * hears about a file. EXIF is captured here rather than re-derived later
 * because the original is the only place it exists and re-reading a 12 MB HEIC
 * to find a timestamp is absurd.
 */
export async function addIntakeItem(
  ownerId: string,
  batchId: string,
  input: { originalUrl: string; exif?: unknown; suggestions?: IntakeSuggestions },
) {
  await assertBatchOwned(ownerId, batchId)
  // The client reports this URL after uploading, so it is untrusted input.
  assertOwnedOriginalUrl(ownerId, input.originalUrl)

  const [row] = await getDb()
    .insert(intakeItems)
    .values({
      batchId,
      originalUrl: input.originalUrl,
      status: 'uploaded',
      ocr: null,
      suggestions: (input.suggestions ?? null) as never,
      corners: null,
    })
    .returning()
  return row!
}

/** One item, owner-checked. The routes use this rather than scanning a list. */
export async function getIntakeItem(ownerId: string, itemId: string) {
  const [row] = await getDb()
    .select({ item: intakeItems })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  return row?.item ?? null
}

export async function listBatchItems(ownerId: string, batchId: string) {
  await assertBatchOwned(ownerId, batchId)
  return getDb()
    .select()
    .from(intakeItems)
    .where(eq(intakeItems.batchId, batchId))
    .orderBy(asc(intakeItems.createdAt))
}

export async function updateIntakeItem(
  ownerId: string,
  itemId: string,
  patch: Partial<typeof intakeItems.$inferInsert>,
) {
  const db = getDb()
  const [item] = await db
    .select({ id: intakeItems.id, batchId: intakeItems.batchId })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  if (!item) throw new Error('intake item not found')

  const { id: _id, batchId: _batchId, ...safe } = patch
  const [row] = await db
    .update(intakeItems)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(intakeItems.id, itemId))
    .returning()
  return row ?? null
}

/**
 * Turns an intake item into a real object.
 *
 * The item keeps pointing at the object it became, so a re-run is a no-op
 * rather than a duplicate — accession has to be safe to retry, because the
 * offline queue will retry it.
 */
export async function fileIntakeItem(
  ownerId: string,
  itemId: string,
  input: {
    title: string
    kind?: string | null
    receivedAt?: string | null
    placeId?: string | null
    occasionId?: string | null
    story?: string | null
    personIds?: string[]
    tagIds?: string[]
  },
) {
  const db = getDb()
  const [item] = await db
    .select({
      id: intakeItems.id,
      objectId: intakeItems.objectId,
      originalUrl: intakeItems.originalUrl,
      cutoutUrl: intakeItems.cutoutUrl,
    })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  if (!item) throw new Error('intake item not found')
  if (item.objectId) return { objectId: item.objectId, alreadyFiled: true as const }

  const object = await createObject(ownerId, {
    title: input.title,
    kind: (input.kind ?? null) as never,
    silhouette: silhouetteForKind(input.kind),
    receivedAt: input.receivedAt ?? null,
    placeId: input.placeId ?? null,
    occasionId: input.occasionId ?? null,
    story: input.story ?? null,
    personIds: input.personIds,
    tagIds: input.tagIds,
  })

  await db.insert(objectFaces).values({
    objectId: object.id,
    role: 'recto',
    originalUrl: item.originalUrl,
    cutoutUrl: item.cutoutUrl,
  })

  await db
    .update(intakeItems)
    .set({ objectId: object.id, status: 'filed', updatedAt: new Date() })
    .where(eq(intakeItems.id, itemId))

  return { objectId: object.id, lotNo: object.lotNo, alreadyFiled: false as const }
}

export async function skipIntakeItems(ownerId: string, itemIds: string[]) {
  if (itemIds.length === 0) return
  const db = getDb()
  const owned = await db
    .select({ id: intakeItems.id })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(inArray(intakeItems.id, itemIds), eq(intakeBatches.ownerId, ownerId)))

  if (owned.length === 0) return
  await db
    .update(intakeItems)
    .set({ status: 'skipped', updatedAt: new Date() })
    .where(inArray(intakeItems.id, owned.map((row) => row.id)))
}

/** Items still waiting to become objects, across every batch. */
export async function listPendingIntake(ownerId: string, limit = 50) {
  return getDb()
    .select({ item: intakeItems })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(
      and(
        eq(intakeBatches.ownerId, ownerId),
        inArray(intakeItems.status, ['uploaded', 'segmented', 'extracted', 'needs_review']),
      ),
    )
    .orderBy(asc(intakeItems.createdAt))
    .limit(limit)
}

export type PendingIntake = Awaited<ReturnType<typeof listPendingIntake>>
