import type { SyncSnapshot } from './types'

export type ArchiveRecord = SyncSnapshot['records'][number]
export const textValue = (value: unknown) => typeof value === 'string' ? value : ''

export function linkedNames(snapshot: SyncSnapshot, record: ArchiveRecord) {
  const personIds = new Set(snapshot.objectPeople.filter((link) => link.objectId === record.id).map((link) => link.personId))
  const tagIds = new Set(snapshot.objectTags.filter((link) => link.objectId === record.id).map((link) => link.tagId))
  const collectionIds = new Set(snapshot.memberships.filter((link) => link.objectId === record.id).map((link) => link.collectionId))
  return {
    people: snapshot.people.filter((row) => personIds.has(row.id)).map((row) => textValue(row.name)),
    tags: snapshot.tags.filter((row) => tagIds.has(row.id)).map((row) => textValue(row.name)),
    collections: snapshot.collections.filter((row) => collectionIds.has(row.id)).map((row) => textValue(row.name)),
    place: textValue(snapshot.places.find((row) => row.id === record.placeId)?.name),
    occasion: textValue(snapshot.occasions.find((row) => row.id === record.occasionId)?.name),
  }
}

export function searchArchive(snapshot: SyncSnapshot, query: string, filter = '', order: 'newest' | 'oldest' | 'lot' = 'newest') {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const [kind, id] = filter.split(':')
  return snapshot.records.filter((record) => {
    if (kind === 'person' && !snapshot.objectPeople.some((link) => link.objectId === record.id && link.personId === id)) return false
    if (kind === 'tag' && !snapshot.objectTags.some((link) => link.objectId === record.id && link.tagId === id)) return false
    if (kind === 'collection' && !snapshot.memberships.some((link) => link.objectId === record.id && link.collectionId === id)) return false
    if (kind === 'place' && record.placeId !== id) return false
    if (kind === 'occasion' && record.occasionId !== id) return false
    const names = linkedNames(snapshot, record)
    const haystack = [record.title, record.story, record.kind, record.lotNo, `OBJ-${String(record.lotNo).padStart(4, '0')}`, record.receivedAt, names.place, names.occasion, ...names.people, ...names.tags, ...names.collections].join(' ').toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  }).sort((a, b) => {
    if (order === 'lot') return Number(a.lotNo) - Number(b.lotNo)
    const first = textValue(a.receivedAt), second = textValue(b.receivedAt)
    if (!first && second) return 1
    if (first && !second) return -1
    const compared = first.localeCompare(second) || Number(a.lotNo) - Number(b.lotNo)
    return order === 'oldest' ? compared : -compared
  })
}
