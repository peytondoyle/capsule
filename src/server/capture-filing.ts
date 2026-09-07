import 'server-only'

import { and, eq } from 'drizzle-orm'

import type { CaptureDraft, CaptureFilingReceipt } from '@/lib/capture-draft'
import { assertOwnedOriginalUrl, deleteBlobs, thumbBesideCutout } from './blob'
import { isSaneQuad } from './warp'
import { silhouetteForKind } from '@/design/silhouettes'
import { consume } from './limits'
import { deriveFromOriginal } from './derive'
import { getTxDb } from './db/pool'
import { intakeBatches, intakeItems, syncOperations } from './db/schema'
import { createObjectInTransaction } from './objects'
import { objectFaces, occasions, people, places, tags } from './db/schema'

export class CaptureFilingInputError extends Error {}
export class CaptureFilingConflictError extends Error {}
export class CaptureFilingLimitError extends Error {}

const date = (value: string) => { const parsed = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertCaptureDraft(draft: CaptureDraft) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.tags) || draft.tags.length > 50 || [draft.title, draft.kind, draft.receivedAt, draft.place, draft.occasion, draft.givenBy, draft.story, ...draft.tags].some((value) => typeof value !== 'string') || draft.title.length > 250 || draft.kind.length > 100 || draft.place.length > 250 || draft.occasion.length > 250 || draft.givenBy.length > 250 || draft.story.length > 20000 || draft.tags.some((tag) => tag.length > 100) || (draft.receivedAt && !date(draft.receivedAt))) throw new CaptureFilingInputError('invalid draft')
  if (draft.corners !== null && (!Array.isArray(draft.corners) || draft.corners.length !== 4 || draft.corners.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) || !isSaneQuad(draft.corners))) throw new CaptureFilingInputError('invalid corners')
}

export async function fileCapturedItem(ownerId: string, itemId: string, draft: CaptureDraft): Promise<CaptureFilingReceipt> {
  assertCaptureDraft(draft)
  const db = getTxDb()
  if (typeof itemId !== 'string' || !uuid.test(itemId)) throw new CaptureFilingInputError('invalid item')
  const key = `capture-file:${itemId}`
  draft = { title: draft.title.trim(), kind: draft.kind.trim(), receivedAt: draft.receivedAt, place: draft.place.trim(), occasion: draft.occasion.trim(), givenBy: draft.givenBy.trim(), tags: [...new Set(draft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort(), story: draft.story, corners: draft.corners?.map(({ x, y }) => ({ x, y })) ?? null }
  const payload = JSON.stringify(draft)
  const [saved] = await db.select({ response: syncOperations.response }).from(syncOperations).where(and(eq(syncOperations.ownerId, ownerId), eq(syncOperations.operationId, key))).limit(1)
  if (saved) {
    const value = saved.response as { payload?: string; receipt?: CaptureFilingReceipt }
    if (value.payload !== payload || !value.receipt) throw new CaptureFilingConflictError('capture draft changed')
    return value.receipt
  }
  const [item] = await db.select({ item: intakeItems }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId))).limit(1)
  if (!item?.item.originalUrl) throw new CaptureFilingInputError('item not found')
  if (item.item.objectId || item.item.status === 'skipped') throw new CaptureFilingConflictError('capture draft changed')
  assertOwnedOriginalUrl(ownerId, item.item.originalUrl)
  if (!(await consume(ownerId, 'derive')).ok) throw new CaptureFilingLimitError('try filing later')
  const derived = await deriveFromOriginal(item.item.originalUrl, { ownerId, key: `intake/${ownerId}/${itemId}` }, draft.corners)
  let committed = false
  try {
  const receipt = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, itemId), eq(intakeBatches.ownerId, ownerId))).limit(1).for('update', { of: intakeItems })
    if (!locked) throw new CaptureFilingConflictError('capture changed')
    const [prior] = await tx.select({ response: syncOperations.response }).from(syncOperations).where(and(eq(syncOperations.ownerId, ownerId), eq(syncOperations.operationId, key))).limit(1)
    if (prior) {
      const value = prior.response as { payload?: string; receipt?: CaptureFilingReceipt }
      if (value.payload !== payload || !value.receipt) throw new CaptureFilingConflictError('capture draft changed')
      return value.receipt
    }
    if (locked.intake_items.updatedAt.getTime() !== item.item.updatedAt.getTime() || locked.intake_items.objectId) {
      throw new CaptureFilingConflictError('capture draft changed')
    }
    const upsert = async (table: typeof places | typeof occasions | typeof tags | typeof people, name: string) => (await tx.insert(table).values({ ownerId, name, ...(table === people ? { initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') } : {}) } as never).onConflictDoUpdate({ target: [table.ownerId, table.nameKey], set: { name } }).returning())[0]!
    const place = draft.place ? await upsert(places, draft.place.trim()) : null
    const occasion = draft.occasion ? await upsert(occasions, draft.occasion.trim()) : null
    const person = draft.givenBy ? await upsert(people, draft.givenBy.trim()) : null
    const tagIds: string[] = []
    for (const tag of draft.tags) tagIds.push((await upsert(tags, tag)).id)
    const object = await createObjectInTransaction(ownerId, { title: draft.title || 'Untitled', kind: (draft.kind || null) as never, silhouette: silhouetteForKind(draft.kind), receivedAt: draft.receivedAt || null, placeId: place?.id, occasionId: occasion?.id, story: draft.story || null, personIds: person ? [person.id] : [], tagIds }, tx)
    await tx.insert(objectFaces).values({ objectId: object.id, role: 'recto', originalUrl: locked.intake_items.originalUrl, cutoutUrl: derived.cutoutUrl, thumbUrl: derived.thumbUrl, width: derived.width, height: derived.height })
    await tx.update(intakeItems).set({ objectId: object.id, status: 'filed', cutoutUrl: derived.cutoutUrl, thumbUrl: derived.thumbUrl, width: derived.width, height: derived.height, corners: draft.corners as never, updatedAt: new Date() }).where(eq(intakeItems.id, itemId))
    const receipt = { itemId, objectId: object.id, lotNo: object.lotNo }
    await tx.insert(syncOperations).values({ ownerId, operationId: key, response: { payload, receipt } as never })
    committed = true
    return receipt
  })
  if (committed) await deleteBlobs({ media: [item.item.cutoutUrl, item.item.thumbUrl ?? thumbBesideCutout(item.item.cutoutUrl)] })
  else await deleteBlobs({ media: [derived.cutoutUrl, derived.thumbUrl] })
  return receipt
  } catch (error) {
    // A transport error at COMMIT is ambiguous: keep the new images for a receipt retry.
    if (error instanceof CaptureFilingConflictError) await deleteBlobs({ media: [derived.cutoutUrl, derived.thumbUrl] })
    throw error
  }
}
