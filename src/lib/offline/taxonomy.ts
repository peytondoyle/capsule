import type { LocalArchive, OutboxEntry } from './store'
import type { SyncSnapshot } from './types'

export type TaxonomyEntity = 'person' | 'place' | 'occasion'
export const taxonomyKind = { person: 'people', place: 'places', occasion: 'occasions' } as const

export function taxonomyEdits(entries: OutboxEntry[], entity: TaxonomyEntity, id: string, field?: 'name' | 'note' | 'coordinates') {
  return entries.filter(entry => entry.mutation.type === 'taxonomy.upsert' && entry.mutation.entity === entity && entry.mutation.id === id && (!field || Object.hasOwn(entry.mutation.values, field))).sort((a, b) => a.sequence - b.sequence)
}

export function taxonomyName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 250) throw new Error('Enter a name between 1 and 250 characters.')
  return trimmed
}

export function personNote(value: string | null) {
  return value?.trim() ? value : null
}

export function projectPersonNotes(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const people = new Map(snapshot.people.map(row => [row.id, row]))
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'taxonomy.upsert' || mutation.entity !== 'person' || !mutation.id || !Object.hasOwn(mutation.values, 'note')) continue
    const current = people.get(mutation.id) ?? entry.baseRecord
    if (current) people.set(mutation.id, { ...current, note: mutation.values.note })
  }
  return { ...snapshot, people: [...people.values()] }
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
  const edits = taxonomyEdits(entries.filter(entry => entry.ownerId === archive.ownerId), entity, id, 'name')
  const stopped = edits.find(entry => entry.response?.outcome === 'conflict' || entry.response?.outcome === 'rejected')
  if (!stopped) return null
  const conflict = stopped.response?.conflict
  const saved = archive.snapshot[taxonomyKind[entity]].find(row => row.id === id) ?? null
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity) || !conflict || saved && saved.revision > conflict.revision ? saved : conflict.current
  const local = projectTaxonomyNames(archive.snapshot, edits)[taxonomyKind[entity]].find(row => row.id === id)
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, revision, pending: edits.some(entry => entry.baseRecord?.localOnly === true), rejected: stopped.response?.outcome === 'rejected', reason: stopped.response?.reason, token: JSON.stringify({ ids: edits.map(entry => entry.operationId), remote, revision, response: stopped.response }) }
}

export function reviewPersonNote(archive: LocalArchive, entries: OutboxEntry[], id: string) {
  const edits = taxonomyEdits(entries.filter(entry => entry.ownerId === archive.ownerId), 'person', id, 'note')
  const stopped = edits.find(entry => entry.response?.outcome === 'conflict' || entry.response?.outcome === 'rejected')
  if (!stopped) return null
  const conflict = stopped.response?.conflict
  const saved = archive.snapshot.people.find(row => row.id === id) ?? null
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity) || !conflict || saved && saved.revision > conflict.revision ? saved : conflict.current
  const local = projectPersonNotes(archive.snapshot, edits).people.find(row => row.id === id)
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, revision, rejected: stopped.response?.outcome === 'rejected', token: JSON.stringify({ ids: edits.map(entry => entry.operationId), remote, revision, response: stopped.response }) }
}

export function pendingTaxonomyCreator(entries: OutboxEntry[], entity: TaxonomyEntity, id: string) {
  const fields = entity === 'person' ? ['givenBy', 'depicted', 'mentioned'] : entity === 'place' ? ['atPlace'] : ['onOccasion']
  return entries.some(entry => entry.mutation.type === 'object.patch' && fields.some(field => {
    const value = entry.mutation.type === 'object.patch' ? entry.mutation.patch.changes[field] : undefined
    return Array.isArray(value) && value.some(ref => ref?.id === id && ref.create === true)
  }))
}

export type PlaceCoordinates = { lat: number | null; lng: number | null }
export const placeCoordinates = (row: Record<string, unknown>): PlaceCoordinates => ({ lat: row.lat as number | null ?? null, lng: row.lng as number | null ?? null })
export const validCoordinateBase = (value: unknown): value is PlaceCoordinates => !!value && typeof value === 'object' && ['lat', 'lng'].every(key => Object.hasOwn(value, key) && ((value as Record<string, unknown>)[key] === null || typeof (value as Record<string, unknown>)[key] === 'number' && Number.isFinite((value as Record<string, unknown>)[key])))
export const validCoordinates = (value: unknown): value is { lat: number; lng: number } => validCoordinateBase(value) && Object.keys(value).length === 2 && value.lat !== null && value.lng !== null && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180
export const sameCoordinates = (a: PlaceCoordinates, b: PlaceCoordinates) => a.lat === b.lat && a.lng === b.lng

export function projectPlaceCoordinates(snapshot: SyncSnapshot, entries: OutboxEntry[]): SyncSnapshot {
  const places = new Map(snapshot.places.map(row => [row.id, row]))
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const mutation = entry.mutation
    if (entry.ownerId !== snapshot.ownerId || mutation.type !== 'taxonomy.upsert' || mutation.entity !== 'place' || !mutation.id || !validCoordinates(mutation.values.coordinates)) continue
    const current = places.get(mutation.id) ?? entry.baseRecord
    if (current) places.set(mutation.id, { ...current, lat: mutation.values.coordinates.lat, lng: mutation.values.coordinates.lng })
  }
  return { ...snapshot, places: [...places.values()] }
}

export function reviewPlaceCoordinates(archive: LocalArchive, entries: OutboxEntry[], id: string) {
  const edits = taxonomyEdits(entries.filter(entry => entry.ownerId === archive.ownerId), 'place', id, 'coordinates')
  const stopped = edits.find(entry => ['conflict', 'rejected'].includes(entry.response?.outcome ?? ''))
  if (!stopped) return null
  const conflict = stopped.response?.conflict, saved = archive.snapshot.places.find(row => row.id === id) ?? null
  const remote = archive.refreshedAt > (stopped.responseAt ?? Infinity) || !conflict || saved && saved.revision > conflict.revision ? saved : conflict.current
  const local = projectPlaceCoordinates(archive.snapshot, edits).places.find(row => row.id === id)
  const revision = Number(remote?.revision ?? conflict?.revision ?? 1)
  return { edits, remote, local, revision, rejected: stopped.response?.outcome === 'rejected', token: JSON.stringify({ ids: edits.map(entry => entry.operationId), remote, revision, response: stopped.response }) }
}
