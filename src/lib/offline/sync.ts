import { listOperations, recordResponse, replaceSnapshot } from './store'
import type { SyncResponse, SyncSnapshot } from './types'
import { validCoordinateBase } from './taxonomy'
import { validSnapshot } from './media'

export type SyncResult =
  | { status: 'synced'; sent: number }
  | { status: 'busy' | 'locked' }
  | { status: 'conflict' | 'rejected'; operationId: string }

export async function syncArchive(ownerId: string, options: {
  isActiveOwner: () => boolean
  signal?: AbortSignal
}): Promise<SyncResult> {
  // Fail closed on browsers without cross-tab coordination.
  if (!navigator.locks) return { status: 'locked' }
  return navigator.locks.request(`capsule-sync:${ownerId}`, { ifAvailable: true }, async (lock): Promise<SyncResult> => {
    if (!lock) return { status: 'busy' }
    const headers = { 'content-type': 'application/json', 'x-capsule-owner': ownerId }
    const active = () => options.isActiveOwner() && !options.signal?.aborted
    if (!active()) return { status: 'locked' }

    const entries = await listOperations(ownerId)
    const confirmed: string[] = []
    let sent = 0
    let stopped: SyncResult | undefined
    for (const entry of entries) {
      if (!active()) return { status: 'locked' }
      let response = entry.response
      if (!response) {
        const res = await fetch('/api/sync', {
          method: 'POST', headers, cache: 'no-store', signal: options.signal,
          body: JSON.stringify({ operationId: entry.operationId, mutation: entry.mutation.type === 'object.patch' && entry.mutation.shelfDependencies?.length ? { ...entry.mutation, type: 'object.patchWithShelfDependencies' } : entry.mutation }),
        })
        if (res.status === 401 || res.status === 409) return { status: 'locked' }
        if (!res.ok) throw new Error('Sync could not finish. Your changes are still saved on this device.')
        response = await res.json() as SyncResponse
        if (response.operationId !== entry.operationId || !['applied', 'duplicate', 'conflict', 'rejected'].includes(response.outcome)) {
          throw new Error('Sync returned an unexpected response. Your changes are still saved on this device.')
        }
        if (response.outcome === 'conflict' && entry.mutation.type === 'object.patch') {
          const conflict = response.conflict
          if (!conflict || conflict.entity !== 'object' || conflict.id !== entry.mutation.patch.id ||
            !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || !Array.isArray(conflict.fields) ||
            (conflict.current !== null && conflict.current?.id !== conflict.id)) {
            throw new Error('The conflict details are incomplete. Your changes are still saved on this device.')
          }
        }
        if (entry.mutation.type === 'taxonomy.upsert' && entry.mutation.entity !== 'tag' &&
          (response.outcome === 'conflict' || response.outcome === 'rejected')) {
          const conflict = response.conflict
          const field = Object.hasOwn(entry.mutation.values, 'coordinates') ? 'coordinates' : Object.hasOwn(entry.mutation.values, 'note') ? 'note' : 'name'
          if ((response.reason !== undefined && (field !== 'name' || response.reason !== 'name_taken')) ||
            ((response.outcome === 'conflict' || response.reason === 'name_taken') && !conflict) ||
            (conflict && (conflict.entity !== entry.mutation.entity || conflict.id !== entry.mutation.id ||
              !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || !Array.isArray(conflict.fields) || conflict.fields.length !== 1 || conflict.fields[0] !== field ||
              (conflict.current !== null && (conflict.current?.id !== conflict.id || (field === 'coordinates' && !validCoordinateBase({ lat: conflict.current.lat, lng: conflict.current.lng })) || (field === 'note' && conflict.current.note !== null && typeof conflict.current.note !== 'string') || typeof conflict.current.name !== 'string' || !conflict.current.name.trim() || conflict.current.name.length > 250 || conflict.current.revision !== conflict.revision || (conflict.current.ownerId !== undefined && conflict.current.ownerId !== ownerId)))))) {
            throw new Error(`The ${field} conflict details are incomplete. Your changes are still saved on this device.`)
          }
        }
        if (entry.mutation.type === 'collection.delete' && (response.outcome === 'conflict' || response.outcome === 'rejected')) {
          const conflict = response.conflict
          if (response.reason === 'shared_collection' ? response.outcome !== 'rejected' || conflict !== undefined || !Array.isArray(response.shareIds) || response.shareIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) : response.reason !== undefined || response.shareIds !== undefined || response.outcome === 'conflict' && !conflict || conflict && (conflict.entity !== 'collection' || conflict.id !== entry.mutation.id || !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || JSON.stringify(conflict.fields) !== '["shelf","memberships"]' || conflict.current !== null && (conflict.current.id !== conflict.id || conflict.current.revision !== conflict.revision || typeof conflict.current.name !== 'string' || conflict.current.ownerId !== undefined && conflict.current.ownerId !== ownerId))) throw new Error('The shelf removal response is unexpected. Your removal is still saved on this device.')
        }
        if (entry.mutation.type === 'collection.reorder' && (response.outcome === 'conflict' || response.outcome === 'rejected')) {
          const conflict = response.conflict
          if (response.reason !== undefined || response.outcome === 'conflict' && !conflict || conflict && (conflict.entity !== 'collection' || conflict.id !== entry.mutation.ids[0] || conflict.revision !== 1 || conflict.current !== null || JSON.stringify(conflict.fields) !== '["order"]')) throw new Error('The shelf order response is unexpected. Your order is still saved on this device.')
        }
        if (entry.mutation.type === 'collection.create' && (response.outcome === 'conflict' || response.reason !== undefined || response.conflict !== undefined)) throw new Error('The shelf creation response is unexpected. Your changes are still saved on this device.')
        if (entry.mutation.type === 'collection.upsert' && (response.outcome === 'conflict' || response.outcome === 'rejected')) {
          const conflict = response.conflict
          if (response.reason !== undefined || response.outcome === 'conflict' && !conflict || conflict && (conflict.entity !== 'collection' || conflict.id !== entry.mutation.id || !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || JSON.stringify(conflict.fields) !== '["name"]' || conflict.current !== null && (conflict.current?.id !== conflict.id || conflict.current.revision !== conflict.revision || typeof conflict.current.name !== 'string' || !['shelf', 'cluster', 'smart'].includes(String(conflict.current.kind)) || conflict.current.ownerId !== undefined && conflict.current.ownerId !== ownerId))) throw new Error('The shelf conflict details are incomplete. Your changes are still saved on this device.')
        }
        if (entry.mutation.type === 'occasion.merge' && (response.outcome === 'conflict' || response.outcome === 'rejected')) {
          const conflict = response.conflict
          if (response.reason !== undefined || response.outcome === 'conflict' && !conflict || conflict && (conflict.entity !== 'occasion' || conflict.id !== entry.mutation.id || !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || JSON.stringify(conflict.fields) !== '["source","target","links"]' || conflict.current !== null && (conflict.current?.id !== conflict.id || conflict.current.revision !== conflict.revision || typeof conflict.current.name !== 'string' || conflict.current.ownerId !== undefined && conflict.current.ownerId !== ownerId))) throw new Error('The merge conflict details are incomplete. Your changes are still saved on this device.')
        }
        if (entry.mutation.type === 'taxonomy.delete' && response.outcome === 'conflict') {
          const conflict = response.conflict
          if (!conflict || conflict.entity !== entry.mutation.entity || conflict.id !== entry.mutation.id || !Number.isSafeInteger(conflict.revision) || conflict.revision < 1 || JSON.stringify(conflict.fields) !== '["entry","links"]' || (conflict.current !== null && (conflict.current?.id !== conflict.id || conflict.current.revision !== conflict.revision || typeof conflict.current.name !== 'string' || (conflict.current.ownerId !== undefined && conflict.current.ownerId !== ownerId)))) throw new Error('The removal conflict details are incomplete. Your changes are still saved on this device.')
        }
        // An account change can happen while a response is in flight. Retain the operation for a safe retry.
        if (!active()) return { status: 'locked' }
        await recordResponse(ownerId, response)
        sent++
      }
      if (response.outcome === 'conflict' || response.outcome === 'rejected') {
        stopped = { status: response.outcome, operationId: entry.operationId }
        break
      }
      confirmed.push(entry.operationId)
    }

    if (!active()) return { status: 'locked' }
    const res = await fetch('/api/sync', { headers, cache: 'no-store', signal: options.signal })
    if (res.status === 401 || res.status === 409) return { status: 'locked' }
    if (!res.ok) throw new Error('Could not refresh the archive. Your changes are still saved on this device.')
    const snapshot = await res.json() as SyncSnapshot
    if (!validSnapshot(snapshot, ownerId)) return { status: 'locked' }
    if (!active()) return { status: 'locked' }
    await replaceSnapshot(ownerId, snapshot, confirmed)
    return stopped ?? { status: 'synced', sent }
  })
}
