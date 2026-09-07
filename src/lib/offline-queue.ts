import { faceBaseline, type FaceTarget, type FaceConflict, type FaceReceipt } from './face-draft'
import { emptyCaptureDraft } from './capture-draft'
import type { CaptureExif, CaptureOriginal } from './capture-types'
import type { CaptureDraft, CaptureFilingReceipt } from './capture-draft'

const DB = 'capsule-offline'
const STORE = 'pending-uploads'

export type PreparedUpload = {
  captureId: string
  name: string
  type: string
  bytes: Blob
  exif?: CaptureExif
  converted: boolean
}

export type PendingUpload = {
  key: string
  ownerId: string
  name: string
  type: string
  bytes: Blob
  taken?: string
  queuedAt: number
  prepared?: PreparedUpload
  itemId?: string
  originalBackup?: CaptureOriginal & { captureId: string }
  draft?: CaptureDraft
  draftRevision?: number
  readyToFile?: boolean
  syncStarted?: boolean
  preview?: Blob
  filed?: CaptureFilingReceipt
  faceTarget?: FaceTarget
  faceConflict?: FaceConflict
  faceReceipt?: FaceReceipt
  dismissed?: boolean
  captureConflict?: { itemId: string; draft: CaptureDraft }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      let value: T
      let failure: unknown
      transaction.oncomplete = () => resolve(value)
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Photo could not be saved on this device.'))
      void run(transaction.objectStore(STORE)).then((output) => { value = output }, (error) => {
        failure = error
        try { transaction.abort() } catch { reject(error) }
      })
    })
  } finally {
    db.close()
  }
}

export async function enqueueUpload(ownerId: string, file: File, taken?: string, draft?: CaptureDraft) {
  const item: PendingUpload = {
    key: crypto.randomUUID(), ownerId, name: file.name, type: file.type,
    bytes: file, taken, queuedAt: Date.now(), ...(draft ? { draft, draftRevision: 0, readyToFile: false } : {}),
  }
  await tx('readwrite', (store) => result(store.add(item)))
  return item.key
}

async function listForOwner(ownerId: string): Promise<PendingUpload[]> {
  const all = await tx('readonly', (store) => result<PendingUpload[]>(store.getAll()))
  return all.filter((item) => item.ownerId === ownerId).sort((a, b) => a.queuedAt - b.queuedAt)
}

export async function listQueued(ownerId: string) {
  return (await listForOwner(ownerId)).filter((item) => !item.itemId)
}

export async function listRetainedOriginals(ownerId: string) {
  return (await listForOwner(ownerId)).filter((item) => !!item.itemId)
}

export function saveCaptureDraft(ownerId: string, key: string, draft: CaptureDraft, ready: boolean, expectedRevision: number, preview?: Blob) {
  return tx('readwrite', async (store) => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId) throw new Error('Photo is not in this account’s local queue.')
    if (item.dismissed || item.syncStarted || item.itemId || item.captureConflict) throw new Error('This photograph has started syncing. Keep this copy of your changes and edit the filed object online.')
    if ((item.draftRevision ?? 0) !== expectedRevision) throw new Error('This draft changed in another tab. Reopen it before saving.')
    await result(store.put({ ...item, draft, readyToFile: ready, draftRevision: expectedRevision + 1, preview }))
  })
}

export function claimUpload(ownerId: string, key: string) {
  return tx('readwrite', async (store) => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || item.itemId || item.dismissed || item.faceConflict || item.captureConflict || (item.draft && !item.readyToFile)) return null
    await result(store.put({ ...item, syncStarted: true }))
    return item
  })
}

export function recordCaptureConflict(ownerId: string, key: string, itemId: string, draft: CaptureDraft) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || item.itemId || item.dismissed || item.faceTarget || !item.syncStarted || !item.draft || item.prepared?.captureId !== itemId || JSON.stringify(item.draft) !== JSON.stringify(draft)) throw new Error('This capture is no longer active.')
    await result(store.put({ ...item, syncStarted: false, captureConflict: { itemId, draft } }))
  })
}

export function dismissCaptureConflict(ownerId: string, key: string, expectedRevision: number) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || item.dismissed || !item.captureConflict || (item.draftRevision ?? 0) !== expectedRevision) throw new Error('This capture review changed in another tab.')
    await result(store.put({ ...item, dismissed: true }))
  })
}

export function retryCaptureConflict(ownerId: string, key: string, expectedRevision: number) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || item.dismissed || !item.captureConflict || !item.draft || (item.draftRevision ?? 0) !== expectedRevision) throw new Error('This capture review changed in another tab.')
    const retry: PendingUpload = { key: crypto.randomUUID(), ownerId, name: item.name, type: item.type, bytes: item.bytes, taken: item.taken, queuedAt: Date.now(), draft: item.draft, draftRevision: 0, readyToFile: false, preview: item.preview }
    await result(store.put({ ...item, dismissed: true }))
    await result(store.add(retry))
    return retry
  })
}

export function acknowledgeFiling(ownerId: string, key: string, filed: CaptureFilingReceipt) {
  return tx('readwrite', async (store) => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || !item.syncStarted || !item.draft || item.prepared?.captureId !== filed.itemId) {
      throw new Error('The archive did not confirm this filing. Its local copy is safe.')
    }
    await result(store.put({ ...item, itemId: filed.itemId, filed }))
  })
}

export function prepareUpload(ownerId: string, key: string, prepared: PreparedUpload) {
  return tx('readwrite', async (store) => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId) throw new Error('Photo is not in this account’s local queue.')
    if (item.prepared) return item.prepared
    await result(store.put({ ...item, prepared }))
    return prepared
  })
}

export function acknowledgeUpload(ownerId: string, key: string, itemId: string) {
  return tx('readwrite', async (store) => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId) throw new Error('Photo is not in this account’s local queue.')
    if (item.draft) throw new Error('Filing must be confirmed before this draft can leave the queue.')
    // Keep the local camera original; storage reclamation is a separate operation.
    if (item.prepared?.converted) await result(store.put({ ...item, itemId }))
    else await result(store.delete(key))
  })
}

export async function removeQueued(key: string) {
  await tx('readwrite', (store) => result(store.delete(key)))
}

export function enqueueFace(ownerId: string, file: File, target: FaceTarget, preview?: Blob) {
  return tx('readwrite', async store => {
    const all = await result<PendingUpload[]>(store.getAll())
    if (all.some(item => item.ownerId === ownerId && !item.itemId && !item.dismissed && item.faceTarget?.objectId === target.objectId && (item.faceTarget.faceId === target.faceId || (target.role !== 'detail' && item.faceTarget.role === target.role)))) throw new Error('Finish or review the saved photo change for this face first.')
    const item: PendingUpload = { key: crypto.randomUUID(), ownerId, name: file.name, type: file.type, bytes: file, queuedAt: Date.now(), faceTarget: target, draft: emptyCaptureDraft, draftRevision: 0, readyToFile: target.action === 'delete', preview }
    await result(store.add(item))
    return item
  })
}

export async function listFaceChanges(ownerId: string, includeDismissed = false) {
  return (await listForOwner(ownerId)).filter(item => !!item.faceTarget && (includeDismissed || !item.dismissed))
}

export function recordFaceConflict(ownerId: string, key: string, operationId: string, conflict: FaceConflict) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || item.faceTarget?.operationId !== operationId || item.itemId || item.dismissed) throw new Error('This photo change is no longer active.')
    await result(store.put({ ...item, faceConflict: conflict }))
  })
}

export function resolveFaceConflict(ownerId: string, key: string, token: string, keepLocal: boolean) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || !item.faceTarget || item.dismissed || !item.faceConflict || JSON.stringify({ target: item.faceTarget, conflict: item.faceConflict }) !== token) throw new Error('This photo review changed in another tab. Reopen it before choosing.')
    if (keepLocal && item.faceConflict.objectDeleted) throw new Error('This object was deleted. Save a copy of your photograph instead.')
    const current = item.faceConflict.current
    await result(store.put(keepLocal ? { ...item, faceTarget: { ...item.faceTarget, operationId: crypto.randomUUID(), faceId: typeof current?.id === 'string' ? current.id : item.faceTarget.action === 'save' ? crypto.randomUUID() : item.faceTarget.faceId, role: current?.role ?? item.faceTarget.role, base: current ? faceBaseline(current) : null }, faceConflict: undefined, prepared: item.faceConflict.sourceChanged ? undefined : item.prepared, originalBackup: item.faceConflict.sourceChanged ? undefined : item.originalBackup, syncStarted: false } : { ...item, dismissed: true }))
  })
}

export function dismissFaceDraft(ownerId: string, key: string, expectedRevision: number) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || !item.faceTarget || item.syncStarted || item.itemId || (item.draftRevision ?? 0) !== expectedRevision) throw new Error('This photo has changed or started syncing. Review it before discarding.')
    await result(store.put({ ...item, dismissed: true }))
  })
}

export function acknowledgeFace(ownerId: string, key: string, receipt: FaceReceipt) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key)), target = item?.faceTarget
    if (!item || item.ownerId !== ownerId || !target || !item.syncStarted || receipt.operationId !== target.operationId || receipt.objectId !== target.objectId || receipt.faceId !== target.faceId || receipt.deleted !== (target.action === 'delete') || (target.action === 'save' && receipt.itemId !== item.prepared?.captureId)) throw new Error('The archive did not confirm this photo change. Its local copy is safe.')
    await result(store.put({ ...item, itemId: receipt.itemId ?? receipt.operationId, faceReceipt: receipt }))
  })
}

export function acknowledgeOriginalBackup(ownerId: string, key: string, captureId: string, original: CaptureOriginal) {
  return tx('readwrite', async store => {
    const item = await result<PendingUpload | undefined>(store.get(key))
    if (!item || item.ownerId !== ownerId || !item.prepared?.converted || item.prepared.captureId !== captureId || (item.itemId && item.itemId !== captureId) || item.bytes.size !== original.size || !/^[a-f0-9]{64}$/.test(original.sha256)) throw new Error('The archive did not confirm this camera original. Its local copy is safe.')
    await result(store.put({ ...item, originalBackup: { ...original, captureId } }))
  })
}
