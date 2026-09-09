import { upload } from '@vercel/blob/client'

import { clientCapturePath, clientCaptureOriginalPath, safeUploadName } from './blob-path'
import type { CaptureExif, CaptureOriginal, CaptureRequest, CaptureResponse } from './capture-types'
import type { FaceConflict, FaceReceipt } from './face-draft'
import type { CaptureFilingReceipt } from './capture-draft'
import { toUploadable } from './heic'
import { acknowledgeOriginalBackup, listRetainedOriginals, acknowledgeFace, recordFaceConflict, recordCaptureConflict, acknowledgeFiling, acknowledgeUpload, claimUpload, listQueued, prepareUpload, type PendingUpload } from './offline-queue'

export type CaptureProgress = {
  key: string
  status: 'saved' | 'uploading' | 'uploaded' | 'failed'
  itemId?: string
  originalBackup?: CaptureOriginal
  retainedOriginal?: boolean
  faceReceipt?: FaceReceipt
  filed?: CaptureFilingReceipt
  error?: string
}

async function readExif(file: File): Promise<CaptureExif | undefined> {
  try {
    const exifr = (await import('exifr')).default
    const data = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
    if (!data) return undefined
    const taken = data.DateTimeOriginal ?? data.CreateDate
    return {
      taken: taken ? new Date(taken).toISOString().slice(0, 10) : undefined,
      lat: typeof data.latitude === 'number' ? data.latitude : undefined,
      lng: typeof data.longitude === 'number' ? data.longitude : undefined,
    }
  } catch {
    return undefined
  }
}

async function preparedPhoto(ownerId: string, item: PendingUpload) {
  if (item.prepared) return item.prepared
  const file = new File([item.bytes], item.name, { type: item.type })
  const exif = await readExif(file)
  const converted = await toUploadable(file)
  if (!converted.ok) throw new Error(converted.reason)
  return prepareUpload(ownerId, item.key, {
    captureId: crypto.randomUUID(), name: safeUploadName(safeUploadName(converted.file.name).slice(-200)), type: converted.file.type,
    bytes: converted.file, converted: converted.converted,
    exif: item.taken ? { ...exif, taken: item.taken } : exif,
  })
}

class AccountChanged extends Error {}

async function captureRequest(ownerId: string, body: CaptureRequest): Promise<CaptureResponse> {
  const response = await fetch('/api/capture', {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-capsule-owner': ownerId },
    body: JSON.stringify(body),
  })
  if (response.status === 401 || response.status === 409) throw new AccountChanged('Sign in to this account to upload its photographs.')
  if (!response.ok) throw new Error('Could not reach the archive. Your photograph is saved on this device.')
  const value = await response.json() as CaptureResponse
  if (!['missing', 'uploaded', 'recorded'].includes(value.status) || (value.status === 'recorded' && value.itemId !== body.captureId)) {
    throw new Error('The archive did not confirm this photograph. Its local copy is safe.')
  }
  if (body.original && value.original !== null && (value.original?.sha256 !== body.original.sha256 || value.original?.size !== body.original.size)) throw new Error('The archive did not confirm the camera original bytes. Its local copy is safe.')
  return value
}

export async function drainCaptures(ownerId: string, options: {
  isActiveOwner: () => boolean
  onProgress: (progress: CaptureProgress) => void
  kind?: 'captures' | 'faces'
}): Promise<'finished' | 'busy' | 'locked'> {
  if (!navigator.locks) return 'locked'
  return navigator.locks.request(`capsule-capture:${ownerId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return 'busy'
    const active = () => options.isActiveOwner()
    if (!active()) return 'locked'
    const queued = [...await listQueued(ownerId), ...(await listRetainedOriginals(ownerId)).filter(item => item.prepared?.converted && !item.originalBackup)]
    for (const candidate of queued) {
      if (candidate.dismissed || !!candidate.faceTarget !== (options.kind === 'faces')) continue
      if (!active()) return 'locked'
      try {
        const item = candidate.itemId ? candidate : await claimUpload(ownerId, candidate.key)
        if (!item) continue
        if (item.faceTarget?.action === 'delete') {
          await syncFace(ownerId, item, options)
          continue
        }
        const prepared = await preparedPhoto(ownerId, item)
        if (item.itemId && item.itemId !== prepared.captureId) throw new Error('This saved original does not match its capture. Keep its local copy.')
        if (!active()) return 'locked'
        const original = prepared.converted ? { size: item.bytes.size, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await item.bytes.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('') } : undefined
        if (!active()) return 'locked'
        const request = { captureId: prepared.captureId, name: prepared.name, exif: prepared.exif, original }
        options.onProgress({ key: item.key, status: 'uploading' })
        let state = await captureRequest(ownerId, { ...request, action: 'status' })
        if (!active()) return 'locked'
        if (original && !state.original) {
          try {
            await upload(clientCaptureOriginalPath(ownerId, prepared.captureId), item.bytes, {
              access: 'private', handleUploadUrl: '/api/blob/upload', contentType: 'image/heic',
            })
          } catch (error) {
            if (!active()) return 'locked'
            state = await captureRequest(ownerId, { ...request, action: 'status' })
            if (!state.original) throw error
          }
        }
        if (!active()) return 'locked'
        if (state.status === 'missing') {
          try {
            await upload(clientCapturePath(ownerId, prepared.captureId, prepared.name), prepared.bytes, {
              access: 'private', handleUploadUrl: '/api/blob/upload', contentType: prepared.type || undefined,
            })
          } catch (error) {
            if (!active()) return 'locked'
            // A lost upload response can still mean the immutable Blob arrived.
            state = await captureRequest(ownerId, { ...request, action: 'status' })
            if (state.status === 'missing') throw error
          }
        }
        if (!active()) return 'locked'
        if (state.status !== 'recorded' || (original && !state.original)) state = await captureRequest(ownerId, { ...request, action: 'finish' })
        if (!active()) return 'locked'
        if (state.status !== 'recorded' || !state.itemId) throw new Error('Upload is not confirmed yet. Your photograph is saved on this device.')
        if (original) {
          if (!state.original) throw new Error('Camera original backup is not confirmed. Its local copy is safe.')
          await acknowledgeOriginalBackup(ownerId, item.key, prepared.captureId, state.original)
          if (!active()) return 'locked'
        }
        if (item.itemId) {
          options.onProgress({ key: item.key, status: 'uploaded', itemId: item.itemId, retainedOriginal: true, originalBackup: state.original ?? undefined })
          continue
        }
        if (item.faceTarget) {
          await syncFace(ownerId, item, options, state.itemId)
          continue
        }
        if (item.draft) {
          const response = await fetch('/api/capture/file', {
            method: 'POST', cache: 'no-store',
            headers: { 'content-type': 'application/json', 'x-capsule-owner': ownerId },
            body: JSON.stringify({ itemId: state.itemId, draft: item.draft }),
          })
          if (!active()) return 'locked'
          if (response.status === 401) throw new AccountChanged('Sign in to this account to finish filing.')
          if (response.status === 409) {
            let body: unknown
            try { body = await response.json() } catch { throw new AccountChanged('Sign in to this account to finish filing.') }
            if (!body || typeof body !== 'object' || (body as { error?: unknown }).error !== 'capture conflict') throw new AccountChanged('Sign in to this account to finish filing.')
            if (!active()) throw new AccountChanged('Sign in to this account to finish filing.')
            await recordCaptureConflict(ownerId, item.key, state.itemId, item.draft)
            throw new Error('This photograph changed in the archive. Your local draft is safe; review it before filing as a new object.')
          }
          if (!response.ok) throw new Error('Filing is not confirmed yet. Your photograph and details are saved on this device.')
          const filed = await response.json() as CaptureFilingReceipt
          if (filed.itemId !== state.itemId || typeof filed.objectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(filed.objectId) || !Number.isSafeInteger(filed.lotNo) || filed.lotNo < 1) {
            throw new Error('The archive did not confirm this filing. Its local copy is safe.')
          }
          if (!active()) return 'locked'
          await acknowledgeFiling(ownerId, item.key, filed)
          options.onProgress({ key: item.key, status: 'uploaded', itemId: state.itemId, retainedOriginal: true, originalBackup: state.original ?? undefined, filed })
          continue
        }
        await acknowledgeUpload(ownerId, item.key, state.itemId)
        options.onProgress({ key: item.key, status: 'uploaded', itemId: state.itemId, retainedOriginal: prepared.converted, originalBackup: state.original ?? undefined })
        void fetch('/api/derive', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: state.itemId }),
        }).then((response) => response.ok && active() ? fetch('/api/extract', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: state.itemId }),
        }) : undefined).catch(() => {})
      } catch (error) {
        options.onProgress({ key: candidate.key, status: 'failed', error: error instanceof Error ? error.message : 'Upload interrupted. Your photograph is saved on this device.' })
        if (error instanceof AccountChanged) return 'locked'
      }
    }
    return 'finished'
  })
}

async function syncFace(ownerId: string, item: PendingUpload, options: { isActiveOwner: () => boolean; onProgress: (progress: CaptureProgress) => void }, itemId?: string) {
  const target = item.faceTarget!
  const response = await fetch('/api/capture/face', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-capsule-owner': ownerId }, body: JSON.stringify({ target, itemId, corners: item.draft?.corners ?? null }) })
  if (!options.isActiveOwner()) throw new AccountChanged('Sign in to this account to sync its photo changes.')
  if (response.status === 401) throw new AccountChanged('Sign in to this account to sync its photo changes.')
  if (response.status === 409) {
    const body = await response.json() as { conflict?: FaceConflict }
    if (!body.conflict || typeof body.conflict.objectDeleted !== 'boolean' || (body.conflict.sourceChanged !== undefined && typeof body.conflict.sourceChanged !== 'boolean') || (body.conflict.current !== null && (typeof body.conflict.current?.id !== 'string' || body.conflict.current.objectId !== target.objectId || !['recto', 'verso', 'detail'].includes(String(body.conflict.current.role))))) throw new AccountChanged('Reopen this account online before reviewing photo changes.')
    if (!options.isActiveOwner()) throw new AccountChanged('Sign in to this account to sync its photo changes.')
    await recordFaceConflict(ownerId, item.key, target.operationId, body.conflict)
    throw new Error('This photograph changed elsewhere. Your local copy is safe; review both versions in the archive.')
  }
  if (!response.ok) throw new Error('Photo sync is not confirmed. Your original and crop remain on this device.')
  const receipt = await response.json() as FaceReceipt
  if (!options.isActiveOwner()) throw new AccountChanged('Sign in to this account to sync its photo changes.')
  if (target.action === 'save' && ([receipt.originalUrl, receipt.cutoutUrl, receipt.thumbUrl].some(url => typeof url !== 'string' || !url) || typeof receipt.width !== 'number' || typeof receipt.height !== 'number' || !Number.isFinite(receipt.width) || !Number.isFinite(receipt.height) || receipt.width <= 0 || receipt.height <= 0)) throw new Error('The photo confirmation is incomplete. Your local copy is safe.')
  await acknowledgeFace(ownerId, item.key, receipt)
  options.onProgress({ key: item.key, status: 'uploaded', itemId, retainedOriginal: true, faceReceipt: receipt })
}
