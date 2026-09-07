import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { faceBaseline, type FaceConflict, type FaceReceipt, type FaceRequest } from '@/lib/face-draft'
import { isSaneCrop } from '@/lib/crop-geometry'
import { assertOwnedOriginalUrl, deleteBlobs } from './blob'
import { deriveFromOriginal } from './derive'
import { consume } from './limits'
import { getTxDb, type DbTransaction } from './db/pool'
import { intakeBatches, intakeItems, objectFaces, objects, syncEntities, syncOperations } from './db/schema'

export class FaceInputError extends Error {}
export class FaceLimitError extends Error {}
export class FaceConflictError extends Error {
  constructor(public conflict: FaceConflict) { super('photograph changed') }
}
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

function normalized(input: FaceRequest): FaceRequest {
  const target = input?.target
  if (!target || !uuid(target.operationId) || !uuid(target.objectId) || !uuid(target.faceId) || !['recto', 'verso', 'detail'].includes(target.role) || !['save', 'delete'].includes(target.action) || (target.base !== null && (!target.base || target.base.id !== target.faceId || target.base.objectId !== target.objectId || target.base.role !== target.role))) throw new FaceInputError('invalid target')
  if (target.action === 'save' && !uuid(input.itemId)) throw new FaceInputError('invalid source')
  if (input.corners !== null && (!Array.isArray(input.corners) || input.corners.length !== 4 || input.corners.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) || !isSaneCrop(input.corners))) throw new FaceInputError('invalid crop')
  return { target: { operationId: target.operationId, objectId: target.objectId, faceId: target.faceId, role: target.role, action: target.action, base: target.base ? faceBaseline(target.base) : null }, ...(target.action === 'save' ? { itemId: input.itemId } : {}), corners: input.corners?.map(({ x, y }) => ({ x, y })) ?? null }
}

async function inspect(db: ReturnType<typeof getTxDb> | DbTransaction, ownerId: string, request: FaceRequest, lock = false) {
  const target = request.target
  const query = db.select({ id: objects.id }).from(objects).where(and(eq(objects.id, target.objectId), eq(objects.ownerId, ownerId))).limit(1)
  const [object] = await (lock ? query.for('update') : query)
  if (!object) throw new FaceConflictError({ current: null, objectDeleted: true })
  const faces = await db.select().from(objectFaces).where(eq(objectFaces.objectId, target.objectId))
  const current = faces.find(face => face.id === target.faceId)
  const occupied = target.role === 'detail' ? undefined : faces.find(face => face.role === target.role && face.id !== target.faceId)
  const conflict = () => new FaceConflictError({ current: current ?? occupied ?? null, objectDeleted: false })
  if (target.action === 'delete' && !current) return null
  if (target.base ? !current || JSON.stringify(faceBaseline(current)) !== JSON.stringify(target.base) : current || occupied) throw conflict()
  if (target.action === 'save' && !current) {
    const [previous] = await db.select().from(syncEntities).where(and(eq(syncEntities.ownerId, ownerId), eq(syncEntities.entity, 'face'), eq(syncEntities.entityId, target.faceId))).limit(1)
    if (previous?.deletedAt) throw conflict()
    const [used] = await db.select({ id: objectFaces.id }).from(objectFaces).where(eq(objectFaces.id, target.faceId)).limit(1)
    if (used) throw new FaceInputError('invalid face')
  }
  return current ?? null
}

export async function saveCapturedFace(ownerId: string, input: FaceRequest): Promise<FaceReceipt> {
  const request = normalized(input), target = request.target, key = `capture-face:${target.operationId}`, payload = JSON.stringify(request)
  const db = getTxDb()
  async function prior(tx: typeof db | DbTransaction) {
    const [saved] = await tx.select({ response: syncOperations.response }).from(syncOperations).where(and(eq(syncOperations.ownerId, ownerId), eq(syncOperations.operationId, key))).limit(1)
    if (!saved) return null
    const value = saved.response as { payload?: string; receipt?: FaceReceipt }
    if (value.payload !== payload || !value.receipt) throw new FaceInputError('operation changed')
    return value.receipt
  }
  const saved = await prior(db)
  if (saved) return saved
  const current = await inspect(db, ownerId, request)
  const loadItem = (tx: typeof db | DbTransaction) => tx.select({ item: intakeItems }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, request.itemId!), eq(intakeBatches.ownerId, ownerId))).limit(1)
  const source = target.action === 'save' ? (await loadItem(db))[0]?.item : null
  if (target.action === 'save' && !source?.originalUrl) throw new FaceInputError('source unavailable')
  if (source && (source.objectId || source.status === 'skipped')) throw new FaceConflictError({ current, objectDeleted: false, sourceChanged: true })
  if (source?.originalUrl) assertOwnedOriginalUrl(ownerId, source.originalUrl)
  if (source && !(await consume(ownerId, 'derive')).ok) throw new FaceLimitError('try later')
  const derived = source?.originalUrl ? await deriveFromOriginal(source.originalUrl, { ownerId, key: `intake/${ownerId}/${source.id}` }, request.corners) : null
  let usedImages = false
  try {
    const receipt = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`)
      const saved = await prior(tx)
      if (saved) return saved
      const current = await inspect(tx, ownerId, request, true)
      if (source) {
        const [locked] = await loadItem(tx).for('update', { of: intakeItems })
        if (!locked || locked.item.objectId || locked.item.status === 'skipped' || locked.item.originalUrl !== source.originalUrl || locked.item.updatedAt.getTime() !== source.updatedAt.getTime()) throw new FaceConflictError({ current, objectDeleted: false, sourceChanged: true })
      }
      if (target.action === 'delete') {
        if (current) await tx.delete(objectFaces).where(and(eq(objectFaces.id, target.faceId), eq(objectFaces.objectId, target.objectId)))
      } else {
        const values = { originalUrl: source!.originalUrl, cutoutUrl: derived!.cutoutUrl, thumbUrl: derived!.thumbUrl, maskUrl: null, width: derived!.width, height: derived!.height, bytes: null, mime: null, dpi: null, exif: source!.exif }
        if (current) await tx.update(objectFaces).set(values).where(eq(objectFaces.id, current.id))
        else await tx.insert(objectFaces).values({ ...values, id: target.faceId, objectId: target.objectId, role: target.role })
        await tx.update(intakeItems).set({ objectId: target.objectId, status: 'filed', cutoutUrl: derived!.cutoutUrl, thumbUrl: derived!.thumbUrl, width: derived!.width, height: derived!.height, corners: request.corners as never, updatedAt: new Date() }).where(eq(intakeItems.id, source!.id))
        usedImages = true
      }
      await tx.insert(syncEntities).values({ ownerId, entity: 'face', entityId: target.faceId, revision: 2, deletedAt: target.action === 'delete' ? new Date() : null }).onConflictDoUpdate({ target: [syncEntities.ownerId, syncEntities.entity, syncEntities.entityId], set: { revision: sql`${syncEntities.revision} + 1`, deletedAt: target.action === 'delete' ? new Date() : null, updatedAt: new Date() } })
      const receipt: FaceReceipt = { operationId: target.operationId, objectId: target.objectId, faceId: target.faceId, deleted: target.action === 'delete', ...(source && derived ? { itemId: source.id, originalUrl: source.originalUrl!, ...derived } : {}) }
      await tx.insert(syncOperations).values({ ownerId, operationId: key, response: { payload, receipt } })
      return receipt
    })
    if (derived && !usedImages) await deleteBlobs({ media: [derived.cutoutUrl, derived.thumbUrl] })
    return receipt
  } catch (error) {
    // Only a known rollback permits cleanup; an interrupted COMMIT may have saved the face.
    if (derived && (error instanceof FaceConflictError || error instanceof FaceInputError)) await deleteBlobs({ media: [derived.cutoutUrl, derived.thumbUrl] })
    throw error
  }
}
