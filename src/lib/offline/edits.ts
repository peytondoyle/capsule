import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'
import { isLinkField, singleLink, linkLabels, withObjectLinks, projectLinks, validReferences } from './links'
import { projectTaxonomyNames, projectPersonNotes, projectPlaceCoordinates } from './taxonomy'
import { projectShelfNames, projectShelfDeletions } from './shelves'
import { projectOccasionMerges } from './taxonomy-merge'
import { projectTaxonomyDeletions } from './taxonomy-delete'

export const editLabels = {
  ...linkLabels,
  title: 'Title', kind: 'Kind', story: 'Story', receivedAt: 'Received date', receivedPrecision: 'Date precision',
  placeId: 'Place', occasionId: 'Occasion', retention: 'Still have it', retainedLocation: 'Kept at', material: 'Material',
} as const
export type EditField = keyof typeof editLabels

export function objectEdits(entries: OutboxEntry[], id: string) {
  return entries.filter((entry) => entry.mutation.type === 'object.patch' && entry.mutation.patch.id === id).sort((a, b) => a.sequence - b.sequence)
}

export function projectArchive(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const canonical = withObjectLinks(snapshot)
  const blockedShelves = new Set(entries.flatMap(entry => entry.mutation.type === 'collection.create' && entry.ownerId === snapshot.ownerId && (entry.response?.outcome === 'rejected' || snapshot.collections.some(row => row.id === (entry.mutation as { id: string }).id) && entry.response?.createdShelfId !== entry.mutation.id) ? [entry.mutation.id] : []))
  snapshot = projectShelfNames(snapshot, entries)
  const records = new Map<string, SyncSnapshot['records'][number]>(withObjectLinks(snapshot).records.map((record) => [record.id, record]))
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    if (entry.ownerId !== snapshot.ownerId || entry.mutation.type !== 'object.patch') continue
    const patch = entry.mutation.patch
    const record = records.get(patch.id) ?? entry.baseRecord
    if (record) {
      const next = { ...record, ...patch.changes }
      const blocked = entry.mutation.shelfDependencies?.filter(dependency => blockedShelves.has(dependency.id)).map(dependency => dependency.id) ?? []
      if (blocked.length && Array.isArray(next.inCollections)) {
        const original = canonical.records.find(row => row.id === patch.id)?.inCollections
        next.inCollections = [...next.inCollections.filter(ref => !blocked.includes(ref.id)), ...(Array.isArray(original) ? original.filter(ref => blocked.includes(ref.id)) : [])]
      }
      if (Object.hasOwn(patch.changes, 'placeId')) next.atPlace = snapshot.places.filter(row => row.id === next.placeId).map(row => ({ id: row.id, name: String(row.name) }))
      if (Object.hasOwn(patch.changes, 'occasionId')) next.onOccasion = snapshot.occasions.filter(row => row.id === next.occasionId).map(row => ({ id: row.id, name: String(row.name) }))
      records.set(patch.id, next)
    }
  }
  return withObjectLinks(projectShelfDeletions(projectShelfNames(projectTaxonomyDeletions(projectOccasionMerges(projectPersonNotes(projectPlaceCoordinates(projectTaxonomyNames(projectLinks({ ...snapshot, records: [...records.values()] }), entries), entries), entries), entries), entries), entries), entries))
}

export function reviewObject(archive: LocalArchive, entries: OutboxEntry[], id: string) {
  const edits = objectEdits(entries.filter(entry => entry.ownerId === archive.ownerId), id)
  const stopped = edits.find((entry) => entry.response?.outcome === 'conflict' || entry.response?.outcome === 'rejected')
  if (!stopped) return null
  const conflict = stopped.response?.conflict
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity)
    ? projectArchive(archive.snapshot, []).records.find((record) => record.id === id) ?? null
    : conflict?.current ?? null
  const local = projectArchive(archive.snapshot, edits).records.find((record) => record.id === id)
  const fields = [...new Set(edits.flatMap((entry) => entry.mutation.type === 'object.patch' ? Object.keys(entry.mutation.patch.changes) : []))]
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, fields, revision, rejected: stopped.response?.outcome === 'rejected', token: JSON.stringify({ ids: edits.map((entry) => entry.operationId), remote, revision, response: stopped.response }) }
}

export function validObjectChanges(changes: Record<string, unknown>) {
  return Object.entries(changes).every(([field, value]) => {
    if (!Object.hasOwn(editLabels, field)) return false
    if (isLinkField(field)) return validReferences(value, singleLink(field) ? 1 : 200)
    if (field === 'receivedAt') {
      if (value === null) return true
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
      const date = new Date(value)
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    }
    if (field === 'receivedPrecision') return ['day', 'month', 'year', 'unknown'].includes(String(value))
    if (field === 'retention') return value === 'retained' || value === 'digital_only'
    if (field === 'placeId' || field === 'occasionId') return value === null || typeof value === 'string'
    if (field === 'title') return typeof value === 'string' && !!value.trim() && value.length <= 250
    return value === null || typeof value === 'string' && value.length <= (field === 'story' ? 20000 : 250)
  })
}
