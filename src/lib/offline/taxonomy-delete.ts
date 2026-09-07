import type { LocalArchive, OutboxEntry } from './store'
import { taxonomyKind, type TaxonomyEntity } from './taxonomy'
import type { SyncSnapshot } from './types'

const fields = {
  person: ['name', 'initials', 'avatarUrl', 'note', 'createdAt', 'updatedAt'],
  place: ['name', 'lat', 'lng', 'kind', 'createdAt', 'updatedAt'],
  occasion: ['name', 'createdAt'],
} as const

export function deletionBase(entity: TaxonomyEntity, row: Record<string, unknown>, links: string[]): { metadata: Record<string, unknown>; links: string[] } {
  return { metadata: Object.fromEntries(fields[entity].map(field => [field, row[field] ?? null])), links: [...new Set(links)].sort() }
}

export function taxonomyDeletionBase(snapshot: SyncSnapshot, entity: TaxonomyEntity, id: string) {
  const row = snapshot[taxonomyKind[entity]].find(row => row.id === id)
  if (!row) return null
  const links = entity === 'person'
    ? snapshot.objectPeople.filter(link => link.personId === id).map(link => `${link.objectId}:${link.role}`)
    : snapshot.records.filter(row => row[entity === 'place' ? 'placeId' : 'occasionId'] === id).map(row => row.id)
  return deletionBase(entity, row, links)
}

export function taxonomyDeletions(entries: OutboxEntry[]) {
  return entries.filter(entry => entry.mutation.type === 'taxonomy.delete')
}

export function projectTaxonomyDeletions(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  let projected = snapshot
  for (const entry of taxonomyDeletions(entries)) {
    const mutation = entry.mutation
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'taxonomy.delete') continue
    const { entity, id } = mutation, kind = taxonomyKind[entity]
    projected = { ...projected, [kind]: projected[kind].filter(row => row.id !== id),
      objectPeople: entity === 'person' ? projected.objectPeople.filter(link => link.personId !== id) : projected.objectPeople,
      records: projected.records.map(row => entity === 'person' ? row : row[entity === 'place' ? 'placeId' : 'occasionId'] === id ? { ...row, [entity === 'place' ? 'placeId' : 'occasionId']: null } : row),
    }
  }
  return projected
}

export function reviewTaxonomyDeletion(archive: LocalArchive, entries: OutboxEntry[], operationId: string) {
  const entry = entries.find(entry => entry.ownerId === archive.ownerId && entry.operationId === operationId && entry.mutation.type === 'taxonomy.delete')
  if (!entry || entry.mutation.type !== 'taxonomy.delete' || !['conflict', 'rejected'].includes(entry.response?.outcome ?? '')) return null
  const { entity, id } = entry.mutation
  const refreshed = archive.refreshedAt > (entry.responseAt ?? Infinity)
  const current = archive.snapshot[taxonomyKind[entity]].find(row => row.id === id) ?? null
  const base = taxonomyDeletionBase(archive.snapshot, entity, id)
  return { entry, current, base, refreshed, token: JSON.stringify({ operationId, current, base, refreshed, response: entry.response }) }
}
