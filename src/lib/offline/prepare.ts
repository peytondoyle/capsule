import { archiveAssets, mediaKey, validSnapshot } from './media'
import { beginPreparation, finishPreparation, mediaAvailability, readMedia, saveArchiveMedia } from './store'
import type { SyncSnapshot } from './types'

export type PreparationProgress = { saved: number; total: number; bytes: number; objects: number }

export async function prepareArchive(ownerId: string, options: {
  isActiveOwner: () => boolean
  onProgress: (progress: PreparationProgress) => void
  signal?: AbortSignal
}): Promise<'ready' | 'busy' | 'locked'> {
  if (!navigator.locks) return 'locked'
  return navigator.locks.request(`capsule-sync:${ownerId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return 'busy'
    const active = () => options.isActiveOwner() && !options.signal?.aborted
    if (!active()) return 'locked'
    const headers = { 'x-capsule-owner': ownerId }
    const response = await fetch('/api/sync', { headers, cache: 'no-store', signal: options.signal })
    if (!active() || response.status === 401 || response.status === 409) return 'locked'
    if (!response.ok) throw new Error('Could not reach your archive. Previously saved photographs remain available.')
    const snapshot = await response.json() as SyncSnapshot
    if (!validSnapshot(snapshot, ownerId)) throw new Error('The archive response is incomplete or belongs to another account.')
    if (!active()) return 'locked'
    const preparation = await beginPreparation(ownerId, snapshot)
    const progress = { ...await mediaAvailability(ownerId, snapshot), objects: snapshot.records.length }
    if (!active()) return 'locked'
    options.onProgress({ ...progress })
    for (const asset of archiveAssets(snapshot)) {
      if (!active()) return 'locked'
      if ((await readMedia(ownerId, mediaKey(asset.source)))?.bytes.size) continue
      const media = await fetch(`/api/offline-media?${new URLSearchParams(asset)}`, { headers, cache: 'no-store', signal: options.signal })
      if (!active() || media.status === 401) return 'locked'
      if (media.status === 409) throw new Error('A photograph changed while downloading. Resume to fetch the latest archive.')
      if (!media.ok || media.headers.get('x-capsule-media-source') !== asset.source) throw new Error('A photograph could not be confirmed. Resume preparation when connected.')
      const bytes = await media.blob()
      if (!active()) return 'locked'
      if (!bytes.type.startsWith('image/') && !(asset.variant === 'original' && bytes.type === 'application/octet-stream')) throw new Error('The archive did not return a photograph. Saved copies remain available.')
      await saveArchiveMedia(ownerId, asset.source, bytes)
      progress.saved++
      progress.bytes += bytes.size
      if (!active()) return 'locked'
      options.onProgress({ ...progress })
    }
    if (!active()) return 'locked'
    await finishPreparation(ownerId, preparation.id)
    return active() ? 'ready' : 'locked'
  })
}
