export type SyncEntity =
  | 'object'
  | 'face'
  | 'person'
  | 'place'
  | 'occasion'
  | 'tag'
  | 'collection'
  | 'membership'

export type SyncPatch = {
  id: string
  baseRevision: number
  base: Record<string, unknown>
  changes: Record<string, unknown>
}

export type OccasionMergeBase = { revision: number; metadata: Record<string, unknown>; links: string[] }

export type SyncMutation =
  | { type: 'object.create'; clientId: string; values: Record<string, unknown> }
  | { type: 'object.patch'; patch: SyncPatch }
  | { type: 'object.delete'; id: string; baseRevision: number; base?: Record<string, unknown> }
  | { type: 'face.upsert'; objectId: string; faceId?: string; baseRevision?: number; values: Record<string, unknown> }
  | { type: 'face.delete'; id: string; baseRevision: number }
  | { type: 'taxonomy.upsert'; entity: 'person' | 'place' | 'occasion' | 'tag'; id?: string; baseRevision?: number; base?: Record<string, unknown>; values: Record<string, unknown> }
  | { type: 'taxonomy.delete'; entity: 'person' | 'place' | 'occasion'; id: string; baseRevision: number; base: { metadata: Record<string, unknown>; links: string[] } }
  | { type: 'occasion.merge'; id: string; targetId: string; base: { source: OccasionMergeBase; target: OccasionMergeBase } }
  | { type: 'collection.reorder'; base: Array<{ id: string; sortOrder: number }>; ids: string[] }
  | { type: 'collection.create'; id: string; values: { name: string } }
  | { type: 'collection.upsert'; id?: string; baseRevision?: number; base?: Record<string, unknown>; values: Record<string, unknown> }
  | { type: 'collection.delete'; id: string; baseRevision: number; base: { metadata: Record<string, unknown>; links: string[] } }
  | { type: 'membership.upsert'; collectionId: string; objectId: string; sortOrder?: number }
  | { type: 'membership.delete'; collectionId: string; objectId: string }

export type SyncRequest = { operationId: string; mutation: SyncMutation }

export type SyncConflict = {
  entity: SyncEntity
  id: string
  revision: number
  current: Record<string, unknown> | null
  fields: string[]
}

export type SyncResponse = {
  operationId: string
  outcome: 'applied' | 'duplicate' | 'conflict' | 'rejected'
  mapping?: { clientId: string; id: string; lotNo: number }
  conflict?: SyncConflict
  reason?: 'name_taken' | 'shared_collection'
  shareIds?: string[]
}

export type SyncSnapshot = {
  version: 1
  ownerId: string
  records: Array<Record<string, unknown> & { id: string; revision: number }>
  faces: Array<Record<string, unknown> & { id: string; revision: number }>
  people: Array<Record<string, unknown> & { id: string; revision: number }>
  places: Array<Record<string, unknown> & { id: string; revision: number }>
  occasions: Array<Record<string, unknown> & { id: string; revision: number }>
  tags: Array<Record<string, unknown> & { id: string; revision: number }>
  collections: Array<Record<string, unknown> & { id: string; revision: number }>
  memberships: Array<{ collectionId: string; objectId: string; sortOrder: number }>
  objectPeople: Array<{ objectId: string; personId: string; role: string }>
  objectTags: Array<{ objectId: string; tagId: string }>
  pendingIntake: Array<Record<string, unknown> & { id: string }>
  tombstones: Array<{ entity: SyncEntity; id: string; revision: number; deletedAt: string }>
}
