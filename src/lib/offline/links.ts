import type { SyncSnapshot } from './types'

export const linkLabels = { atPlace: 'Place', onOccasion: 'Occasion', givenBy: 'Given by', depicted: 'People pictured', mentioned: 'People mentioned', tagged: 'Tags', inCollections: 'Collections' } as const
export type LinkField = keyof typeof linkLabels
export type LinkReference = { id: string; name: string; create?: true }
export const personRoles = { givenBy: 'given_by', depicted: 'depicted', mentioned: 'mentioned' } as const
export const singleLink = (field: LinkField) => field === 'atPlace' || field === 'onOccasion'
export const isLinkField = (field: string): field is LinkField => Object.hasOwn(linkLabels, field)
export const referenceIds = (value: unknown) => Array.isArray(value) ? value.map((ref: LinkReference) => ref.id).sort() : []
export const sameField = (field: string, a: unknown, b: unknown) => JSON.stringify(isLinkField(field) ? referenceIds(a) : a) === JSON.stringify(isLinkField(field) ? referenceIds(b) : b)
export const validReferences = (value: unknown, limit = 200): value is LinkReference[] => Array.isArray(value) && value.length <= limit && value.every(ref => ref && typeof ref === 'object' && typeof ref.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.id) && typeof ref.name === 'string' && !!ref.name.trim() && ref.name.length <= 250 && (ref.create === undefined || ref.create === true)) && new Set(value.map(ref => ref.id)).size === value.length

export function linkChoices(snapshot: SyncSnapshot, field: LinkField): LinkReference[] {
  const rows = field === 'atPlace' ? snapshot.places : field === 'onOccasion' ? snapshot.occasions : field === 'tagged' ? snapshot.tags : field === 'inCollections' ? snapshot.collections.filter(row => row.kind !== 'smart') : snapshot.people
  return rows.map(row => ({ id: row.id, name: String(row.name), ...(row.localOnly ? { create: true as const } : {}) }))
}

export function withObjectLinks(snapshot: SyncSnapshot): SyncSnapshot {
  const people = new Map(linkChoices(snapshot, 'givenBy').map(ref => [ref.id, ref]))
  const tags = new Map(linkChoices(snapshot, 'tagged').map(ref => [ref.id, ref]))
  const collections = new Map(linkChoices(snapshot, 'inCollections').map(ref => [ref.id, ref]))
  const places = new Map(linkChoices(snapshot, 'atPlace').map(ref => [ref.id, ref]))
  const occasions = new Map(linkChoices(snapshot, 'onOccasion').map(ref => [ref.id, ref]))
  const grouped = new Map<string, Record<LinkField, LinkReference[]>>()
  const values = (id: string) => {
    if (!grouped.has(id)) grouped.set(id, { atPlace: [], onOccasion: [], givenBy: [], depicted: [], mentioned: [], tagged: [], inCollections: [] })
    return grouped.get(id)!
  }
  for (const link of snapshot.objectPeople) {
    const field = (Object.keys(personRoles) as Array<keyof typeof personRoles>).find(key => personRoles[key] === link.role)
    const ref = people.get(link.personId)
    if (field && ref) values(link.objectId)[field].push(ref)
  }
  for (const link of snapshot.objectTags) { const ref = tags.get(link.tagId); if (ref) values(link.objectId).tagged.push(ref) }
  for (const link of snapshot.memberships) { const ref = collections.get(link.collectionId); if (ref) values(link.objectId).inCollections.push(ref) }
  return { ...snapshot, records: snapshot.records.map(record => ({ ...record, ...values(record.id), atPlace: places.has(String(record.placeId)) ? [places.get(String(record.placeId))!] : [], onOccasion: occasions.has(String(record.occasionId)) ? [occasions.get(String(record.occasionId))!] : [] })) }
}

export function projectLinks(snapshot: SyncSnapshot): SyncSnapshot {
  const records = new Map(snapshot.records.map(record => [record.id, record]))
  const people = new Map(snapshot.people.map(row => [row.id, row])), tags = new Map(snapshot.tags.map(row => [row.id, row])), collections = new Map(snapshot.collections.map(row => [row.id, row]))
  const places = new Map(snapshot.places.map(row => [row.id, row])), occasions = new Map(snapshot.occasions.map(row => [row.id, row]))
  const order = new Map(snapshot.memberships.map(link => [`${link.objectId}:${link.collectionId}`, link.sortOrder]))
  const objectPeople = snapshot.objectPeople.filter(link => {
    const field = (Object.keys(personRoles) as Array<keyof typeof personRoles>).find(key => personRoles[key] === link.role)
    return !field || !Object.hasOwn(records.get(link.objectId) ?? {}, field)
  })
  const objectTags = snapshot.objectTags.filter(link => !Object.hasOwn(records.get(link.objectId) ?? {}, 'tagged'))
  const memberships = snapshot.memberships.filter(link => !Object.hasOwn(records.get(link.objectId) ?? {}, 'inCollections') || collections.get(link.collectionId)?.kind === 'smart')
  for (const record of snapshot.records) for (const key of Object.keys(linkLabels)) {
    const field = key as LinkField, refs = record[field] as LinkReference[] | undefined
    if (!refs) continue
    const rows = field === 'atPlace' ? places : field === 'onOccasion' ? occasions : field === 'tagged' ? tags : field === 'inCollections' ? collections : people
    for (const ref of refs) {
      if (!rows.has(ref.id)) rows.set(ref.id, { id: ref.id, name: ref.name, revision: 1, ...(ref.create ? { localOnly: true } : {}), ...(field === 'inCollections' ? { kind: 'shelf' } : {}) })
      if (field === 'atPlace' || field === 'onOccasion') continue
      if (field === 'tagged') objectTags.push({ objectId: record.id, tagId: ref.id })
      else if (field === 'inCollections') memberships.push({ objectId: record.id, collectionId: ref.id, sortOrder: order.get(`${record.id}:${ref.id}`) ?? 0 })
      else objectPeople.push({ objectId: record.id, personId: ref.id, role: personRoles[field] })
    }
  }
  return { ...snapshot, records: snapshot.records.map(record => ({ ...record, ...(Array.isArray(record.atPlace) ? { placeId: record.atPlace[0]?.id ?? null } : {}), ...(Array.isArray(record.onOccasion) ? { occasionId: record.onOccasion[0]?.id ?? null } : {}) })), places: [...places.values()], occasions: [...occasions.values()], people: [...people.values()], tags: [...tags.values()], collections: [...collections.values()], objectPeople, objectTags, memberships }
}
