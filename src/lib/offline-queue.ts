/**
 * The offline half of capture: files photographed with no signal wait in
 * IndexedDB and flush on the next visit with connectivity.
 *
 * IndexedDB is a waiting room, not storage — Blob is the source of truth the
 * moment bytes land, and iOS evicts IDB under pressure, so the queue is small,
 * explicit, and drained at every opportunity.
 */

const DB = 'capsule-offline'
const STORE = 'pending-uploads'

export type PendingUpload = {
  key: string
  /**
   * Whose photograph this is. On a shared device the next signed-in user's
   * drain used to upload the previous user's parked captures into their own
   * archive; rows are now stamped at enqueue and filtered at drain. Rows
   * written before the stamp existed have no owner and are never drained.
   */
  ownerId: string
  name: string
  type: string
  bytes: Blob
  taken?: string
  queuedAt: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function enqueueUpload(ownerId: string, file: File, taken?: string) {
  const item: PendingUpload = {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    name: file.name,
    type: file.type,
    bytes: file,
    taken,
    queuedAt: Date.now(),
  }
  await tx('readwrite', (store) => store.put(item))
  return item.key
}

export async function listQueued(ownerId: string): Promise<PendingUpload[]> {
  const all = await tx('readonly', (store) => store.getAll() as IDBRequest<PendingUpload[]>)
  return all.filter((item) => item.ownerId === ownerId)
}

export async function removeQueued(key: string) {
  await tx('readwrite', (store) => store.delete(key))
}
