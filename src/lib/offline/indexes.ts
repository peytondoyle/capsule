import type { SyncSnapshot } from './types'

export type ArchiveIndexKind = 'people' | 'places' | 'occasions'
type IndexRow = SyncSnapshot['people'][number] | SyncSnapshot['places'][number] | SyncSnapshot['occasions'][number]
type IndexEntry = { record: IndexRow; objectCount: number; roles?: { given_by: number; depicted: number; mentioned: number } }

const roleNames = ['given_by', 'depicted', 'mentioned'] as const
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).toLocaleLowerCase() : ''
const rowsFor = (snapshot: SyncSnapshot, kind: ArchiveIndexKind): IndexRow[] => kind === 'people' ? snapshot.people : kind === 'places' ? snapshot.places : snapshot.occasions

function associations(snapshot: SyncSnapshot, kind: ArchiveIndexKind) {
  const valid = new Set(snapshot.records.map(record => record.id))
  const result = new Map<string, Set<string>>()
  const add = (taxonomyId: unknown, objectId: string) => {
    if (typeof taxonomyId !== 'string' || !valid.has(objectId)) return
    const ids = result.get(taxonomyId) ?? new Set<string>()
    ids.add(objectId); result.set(taxonomyId, ids)
  }
  if (kind === 'people') for (const link of snapshot.objectPeople) add(link.personId, link.objectId)
  else for (const record of snapshot.records) {
    const refs = kind === 'places' ? record.atPlace : record.onOccasion
    if (Array.isArray(refs)) for (const ref of refs) add(ref && typeof ref === 'object' ? (ref as { id?: unknown }).id : undefined, record.id)
    else add(kind === 'places' ? record.placeId : record.occasionId, record.id)
  }
  return result
}

export function archiveIndex(snapshot: SyncSnapshot, kind: ArchiveIndexKind, query = ''): IndexEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  const byId = associations(snapshot, kind)
  const valid = new Set(snapshot.records.map(record => record.id))
  const validPeopleRoles = kind === 'people' ? new Map<string, Map<typeof roleNames[number], Set<string>>>() : null
  if (validPeopleRoles) for (const link of snapshot.objectPeople) {
    if (!roleNames.includes(link.role as typeof roleNames[number]) || !valid.has(link.objectId)) continue
    const roles = validPeopleRoles.get(link.personId) ?? new Map<typeof roleNames[number], Set<string>>()
    const ids = roles.get(link.role as typeof roleNames[number]) ?? new Set<string>(); ids.add(link.objectId); roles.set(link.role as typeof roleNames[number], ids); validPeopleRoles.set(link.personId, roles)
  }
  return rowsFor(snapshot, kind).filter(record => {
    if (!needle) return true
    const fields = [record.name, ...(kind === 'people' ? [record.note] : kind === 'places' ? [record.kind] : [])]
    return fields.some(value => text(value).includes(needle))
  }).map(record => {
    if (kind !== 'people') return { record, objectCount: byId.get(record.id)?.size ?? 0 }
    const roleSets = validPeopleRoles!.get(record.id) ?? new Map()
    const roles = Object.fromEntries(roleNames.map(role => [role, roleSets.get(role)?.size ?? 0])) as IndexEntry['roles']
    return { record, objectCount: byId.get(record.id)?.size ?? 0, roles }
  }).sort((a, b) => text(a.record.name).localeCompare(text(b.record.name)) || a.record.id.localeCompare(b.record.id))
}

export function indexObjectIds(snapshot: SyncSnapshot, kind: ArchiveIndexKind, id: string, role?: typeof roleNames[number]) {
  if (!rowsFor(snapshot, kind).some(row => row.id === id)) return new Set<string>()
  if (kind !== 'people' || !role) return associations(snapshot, kind).get(id) ?? new Set<string>()
  const valid = new Set(snapshot.records.map(record => record.id)), ids = new Set<string>()
  for (const link of snapshot.objectPeople) if (link.personId === id && link.role === role && valid.has(link.objectId)) ids.add(link.objectId)
  return ids
}
