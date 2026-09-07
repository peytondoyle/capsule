import type { SyncSnapshot } from './types'

export type ArchiveAsset = {
  kind: 'face' | 'intake'
  id: string
  variant: 'original' | 'cutout' | 'thumb' | 'mask'
  source: string
}

export function mediaKey(source: string) { return `remote:${source}` }

export function archiveAssets(snapshot: SyncSnapshot): ArchiveAsset[] {
  const assets = new Map<string, ArchiveAsset>()
  for (const [kind, rows] of [['face', snapshot.faces], ['intake', snapshot.pendingIntake]] as const) {
    for (const row of rows) {
      for (const variant of ['original', 'cutout', 'thumb', 'mask'] as const) {
        const source = row[`${variant}Url`]
        if (typeof source === 'string' && source) assets.set(source, { kind, id: row.id, variant, source })
      }
    }
  }
  return [...assets.values()]
}

export function validSnapshot(value: SyncSnapshot, ownerId: string) {
  return value?.version === 1 && value.ownerId === ownerId &&
    ['records', 'faces', 'people', 'places', 'occasions', 'tags', 'collections', 'memberships', 'objectPeople', 'objectTags', 'pendingIntake', 'tombstones'].every((key) => Array.isArray(value[key as keyof SyncSnapshot]))
}
