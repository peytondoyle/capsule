import 'server-only'

import { BlobNotFoundError, head } from '@vercel/blob'
import { and, eq, sql } from 'drizzle-orm'

import type { CaptureExif, CaptureResponse, CaptureOriginal } from '@/lib/capture-types'
import { clientCapturePath, safeUploadName, isClientCapturePath } from '@/lib/blob-path'
import { assertOwnedOriginalUrl, originalsToken, MAX_ORIGINAL_BYTES } from './blob'
import { confirmCaptureOriginal, readCaptureOriginal } from './capture-original'
import { getTxDb } from './db/pool'
import { intakeBatches, intakeItems } from './db/schema'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class CaptureInputError extends Error {}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function assertCaptureInput(captureId: string, name: string, exif?: CaptureExif, original?: CaptureOriginal) {
  if (typeof captureId !== 'string' || typeof name !== 'string' || !uuid.test(captureId) || !name || name === '.' || name === '..' || safeUploadName(name) !== name || name.length > 200) throw new CaptureInputError('invalid capture')
  if (original !== undefined && (!original || typeof original !== 'object' || Array.isArray(original) || typeof original.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(original.sha256) || !Number.isSafeInteger(original.size) || original.size < 1 || original.size > MAX_ORIGINAL_BYTES)) throw new CaptureInputError('invalid camera original')
  if (exif !== undefined && (exif === null || typeof exif !== 'object' || Array.isArray(exif))) throw new CaptureInputError('invalid exif')
  if (exif && ((exif.taken !== undefined && !validDate(exif.taken)) || (exif.lat !== undefined && (typeof exif.lat !== 'number' || !Number.isFinite(exif.lat) || exif.lat < -90 || exif.lat > 90)) || (exif.lng !== undefined && (typeof exif.lng !== 'number' || !Number.isFinite(exif.lng) || exif.lng < -180 || exif.lng > 180)))) throw new CaptureInputError('invalid exif')
}

async function exists(ownerId: string, captureId: string) {
  const [item] = await getTxDb().select({ id: intakeItems.id, originalUrl: intakeItems.originalUrl }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, captureId), eq(intakeBatches.ownerId, ownerId))).limit(1)
  return item
}

async function uploaded(ownerId: string, captureId: string, name: string) {
  try {
    const pathname = clientCapturePath(ownerId, captureId, name)
    const url = (await head(pathname, { token: originalsToken() })).url
    if (new URL(url).pathname !== `/${pathname}`) throw new Error('capture blob path mismatch')
    return assertOwnedOriginalUrl(ownerId, url)
  } catch (error) { if (error instanceof BlobNotFoundError) return null; throw error }
}

export async function captureStatus(ownerId: string, captureId: string, name: string, original?: CaptureOriginal): Promise<CaptureResponse> {
  const item = await exists(ownerId, captureId)
  if (item) {
    if (!item.originalUrl || new URL(item.originalUrl).pathname !== `/${clientCapturePath(ownerId, captureId, name)}`) throw new CaptureInputError('capture name mismatch')
    return { status: 'recorded', itemId: item.id, ...(original ? { original: await confirmCaptureOriginal(ownerId, captureId, original) } : {}) }
  }
  return { status: (await uploaded(ownerId, captureId, name)) ? 'uploaded' : 'missing', ...(original ? { original: await confirmCaptureOriginal(ownerId, captureId, original) } : {}) }
}

export async function finishCapture(ownerId: string, captureId: string, name: string, exif?: CaptureExif, original?: CaptureOriginal): Promise<CaptureResponse> {
  const originalUrl = await uploaded(ownerId, captureId, name)
  if (!originalUrl) return { status: 'missing' }
  const backup = original ? await confirmCaptureOriginal(ownerId, captureId, original) : undefined
  if (original && !backup) return { status: 'uploaded', original: null }
  const result = await getTxDb().transaction<CaptureResponse>(async (db) => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}), hashtext(${captureId}))`)
    const [existing] = await db.select({ id: intakeItems.id, originalUrl: intakeItems.originalUrl }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, captureId), eq(intakeBatches.ownerId, ownerId))).limit(1).for('update', { of: intakeItems })
    if (existing) {
      if (!existing.originalUrl || new URL(existing.originalUrl).pathname !== `/${clientCapturePath(ownerId, captureId, name)}`) throw new CaptureInputError('capture name mismatch')
      return { status: 'recorded', itemId: existing.id }
    }
    const [batch] = await db.insert(intakeBatches).values({ ownerId, source: 'files' }).returning()
    if (!batch) throw new Error('could not create batch')
    const suggestions = exif?.taken ? { date: { value: exif.taken, confidence: 1 } } : null
    await db.insert(intakeItems).values({ id: captureId, batchId: batch.id, originalUrl, exif: exif ?? null, suggestions, status: 'uploaded' })
    return { status: 'recorded', itemId: captureId }
  })
  return { ...result, ...(original ? { original: backup } : {}) }
}

export async function downloadCaptureOriginal(ownerId: string, captureId: string) {
  if (!uuid.test(captureId)) return null
  const item = await exists(ownerId, captureId)
  if (!item?.originalUrl) return null
  assertOwnedOriginalUrl(ownerId, item.originalUrl)
  const pathname = new URL(item.originalUrl).pathname.slice(1)
  if (!isClientCapturePath(ownerId, pathname) || pathname.split('/')[3] !== captureId) return null
  return readCaptureOriginal(ownerId, captureId)
}
