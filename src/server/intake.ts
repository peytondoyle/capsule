import 'server-only'

import { and, asc, eq, inArray } from 'drizzle-orm'

import { getDb } from './db'
import { intakeBatches, intakeItems, objectFaces, objects } from './db/schema'
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
export type IntakeExif = { taken?: string; lat?: number; lng?: number }

export async function addIntakeItem(
  ownerId: string,
  batchId: string,
  input: { originalUrl: string; exif?: IntakeExif | null; suggestions?: IntakeSuggestions },
) {
  await assertBatchOwned(ownerId, batchId)
  // The client reports this URL after uploading, so it is untrusted input.
  assertOwnedOriginalUrl(ownerId, input.originalUrl)

  // The capture date is seeded straight into `suggestions` as a full-confidence
  // value, not just stored raw. That makes the Filer show a date chip with no
  // model involved at all, and gives /api/extract the exifDate hint it has
  // always read from `suggestions.date` and never once found — because nothing
  // wrote it. EXIF wins on dates; it is ground truth, not a guess.
  const seeded: IntakeSuggestions = { ...(input.suggestions ?? {}) }
  if (input.exif?.taken && !seeded.date) {
    seeded.date = { value: input.exif.taken, confidence: 1 }
  }

  const [row] = await getDb()
    .insert(intakeItems)
    .values({
      batchId,
      originalUrl: input.originalUrl,
      status: 'uploaded',
      ocr: null,
      exif: (input.exif ?? null) as never,
      suggestions: (Object.keys(seeded).length ? seeded : null) as never,
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

/** The statuses that put an item back in the filing queue. */
const PENDING_STATUSES = ['uploaded', 'segmented', 'extracted', 'needs_review'] as const

export async function updateIntakeItem(
  ownerId: string,
  itemId: string,
  patch: Partial<typeof intakeItems.$inferInsert>,
) {
  const db = getDb()
  const [item] = await db
    .select({
      id: intakeItems.id,
      batchId: intakeItems.batchId,
      objectId: intakeItems.objectId,
      status: intakeItems.status,
    })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  if (!item) throw new Error('intake item not found')

  const { id: _id, batchId: _batchId, ...safe } = patch

  // The derive and extract jobs are kicked off unawaited from the uploader, so
  // one can land after the user has already dealt with the item from /queue.
  // Letting it write a pending status back would resurrect the item into
  // listPendingIntake. Keyed on the item having *left the queue*, not on
  // objectId: an objectId check protects filed items but not skipped ones, so a
  // late derive un-skipped a photograph and put it back at the head of the
  // queue. The legitimate uploaded → segmented → needs_review progression is
  // unaffected — all of those are pending, so the guard never fires.
  if (
    !(PENDING_STATUSES as readonly string[]).includes(item.status) &&
    safe.status &&
    (PENDING_STATUSES as readonly string[]).includes(safe.status)
  ) {
    delete safe.status
  }
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
      status: intakeItems.status,
      originalUrl: intakeItems.originalUrl,
      cutoutUrl: intakeItems.cutoutUrl,
      thumbUrl: intakeItems.thumbUrl,
      width: intakeItems.width,
      height: intakeItems.height,
    })
    .from(intakeItems)
    .innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId))
    .where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId)))
    .limit(1)
  if (!item) throw new Error('intake item not found')
  if (item.objectId) {
    // Self-heal: if anything did drift the status back to a pending value, an
    // attempt to file is the moment to put it right, so the item leaves the
    // queue instead of sitting at its head forever.
    if ((PENDING_STATUSES as readonly string[]).includes(item.status)) {
      await db
        .update(intakeItems)
        .set({ status: 'filed', updatedAt: new Date() })
        .where(eq(intakeItems.id, itemId))
    }
    return { objectId: item.objectId, alreadyFiled: true as const }
  }

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
    // Carried across so the archive has real dimensions and a thumbnail to
    // render. Still a snapshot of whatever the derive had produced by now —
    // repairObjectFace is what closes the gap when it had produced nothing.
    thumbUrl: item.thumbUrl,
    width: item.width,
    height: item.height,
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
        inArray(intakeItems.status, [...PENDING_STATUSES]),
      ),
    )
    .orderBy(asc(intakeItems.createdAt))
    .limit(limit)
}

export type PendingIntake = Awaited<ReturnType<typeof listPendingIntake>>

/**
 * Writes a late derive through to the object it was already filed as.
 *
 * fileIntakeItem snapshots whatever URLs exist at filing time, and the derive is
 * kicked off unawaited — so filing quickly produced an object whose photograph
 * was unreachable for good. Nothing read intake_items again after filing, so the
 * derive that eventually landed went nowhere.
 *
 * Owner-checked through the object, not trusted from the caller.
 */
export async function repairObjectFace(
  ownerId: string,
  objectId: string,
  derived: { cutoutUrl: string; thumbUrl: string; width: number; height: number },
) {
  const db = getDb()
  const [owned] = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.id, objectId), eq(objects.ownerId, ownerId)))
    .limit(1)
  if (!owned) return null

  const [row] = await db
    .update(objectFaces)
    .set({
      cutoutUrl: derived.cutoutUrl,
      thumbUrl: derived.thumbUrl,
      width: derived.width,
      height: derived.height,
    })
    .where(and(eq(objectFaces.objectId, objectId), eq(objectFaces.role, 'recto')))
    .returning()
  return row ?? null
}
