import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'

export type TaxonomyEntity = 'person' | 'place' | 'occasion'
export const taxonomyKind = { person: 'people', place: 'places', occasion: 'occasions' } as const

export function taxonomyEdits(entries: OutboxEntry[], entity: TaxonomyEntity, id: string) {
  return entries.filter(entry => entry.mutation.type === 'taxonomy.upsert' && entry.mutation.entity === entity && entry.mutation.id === id).sort((a, b) => a.sequence - b.sequence)
}

export function taxonomyName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 250) throw new Error('Enter a name between 1 and 250 characters.')
  return trimmed
}

export function projectTaxonomyNames(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const maps = { person: new Map(snapshot.people.map(row => [row.id, row])), place: new Map(snapshot.places.map(row => [row.id, row])), occasion: new Map(snapshot.occasions.map(row => [row.id, row])) }
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'taxonomy.upsert' || mutation.entity === 'tag' || !mutation.id || typeof mutation.values.name !== 'string') continue
    const rows = maps[mutation.entity], current = rows.get(mutation.id) ?? entry.baseRecord
    if (current) rows.set(mutation.id, { ...current, name: mutation.values.name })
  }
  return { ...snapshot, people: [...maps.person.values()], places: [...maps.place.values()], occasions: [...maps.occasion.values()] }
}

export function reviewTaxonomyName(archive: LocalArchive, entries: OutboxEntry[], entity: TaxonomyEntity, id: string) {
  const edits = taxonomyEdits(entries.filter(entry => entry.ownerId === archive.ownerId), entity, id)
  const stopped = edits.find(entry => entry.response?.outcome === 'conflict' || entry.response?.outcome === 'rejected')
  if (!stopped) return null
  const conflict = stopped.response?.conflict
  const saved = archive.snapshot[taxonomyKind[entity]].find(row => row.id === id) ?? null
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity) || !conflict ? saved : conflict.current
  const local = projectTaxonomyNames(archive.snapshot, edits)[taxonomyKind[entity]].find(row => row.id === id)
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, revision, rejected: stopped.response?.outcome === 'rejected', reason: stopped.response?.reason, token: JSON.stringify({ ids: edits.map(entry => entry.operationId), remote, revision, response: stopped.response }) }
}
