'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser } from '@/server/auth'
import {
  addIntakeItem,
  createBatch,
  fileIntakeItem,
  skipIntakeItems,
  updateIntakeItem,
  type IntakeSuggestions,
} from '@/server/intake'
import { upsertOccasion, upsertPlace, upsertTag } from '@/server/taxonomy'
import { upsertPerson } from '@/server/people'

async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) throw new Error('not signed in')
  return user.id
}

export async function startBatchAction(source: 'camera' | 'share_target' | 'files' = 'files') {
  const ownerId = await requireOwner()
  const batch = await createBatch(ownerId, source)
  return batch.id
}

/** Called once the client upload has landed the bytes in Blob. */
export async function recordUploadAction(
  batchId: string,
  originalUrl: string,
  exif?: unknown,
  suggestions?: IntakeSuggestions,
) {
  const ownerId = await requireOwner()
  const item = await addIntakeItem(ownerId, batchId, { originalUrl, exif, suggestions })
  revalidatePath('/accession')
  revalidatePath('/queue')
  return item.id
}

export async function setCornersAction(itemId: string, corners: unknown) {
  const ownerId = await requireOwner()
  await updateIntakeItem(ownerId, itemId, {
    corners: corners as never,
    status: 'segmented',
  })
}

/**
 * "TAP WHAT'S TRUE. THE REST CAN WAIT." — every field is optional, and an item
 * with nothing but a photograph still becomes a real object. It just lands in
 * Unfiled, which is exactly where the design wants it.
 */
export async function fileItemAction(itemId: string, formData: FormData) {
  const ownerId = await requireOwner()

  const text = (key: string) => {
    const value = formData.get(key)
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  const placeName = text('place')
  const occasionName = text('occasion')
  const personName = text('givenBy')
  const tagNames = (formData.getAll('tag') as string[])
    .map((t) => t.trim())
    .filter(Boolean)

  const [place, occasion, person, tags] = await Promise.all([
    placeName ? upsertPlace(ownerId, placeName) : null,
    occasionName ? upsertOccasion(ownerId, occasionName) : null,
    personName ? upsertPerson(ownerId, personName) : null,
    Promise.all(tagNames.map((name) => upsertTag(ownerId, name))),
  ])

  const result = await fileIntakeItem(ownerId, itemId, {
    title: text('title') ?? 'Untitled',
    kind: text('kind'),
    receivedAt: text('receivedAt'),
    placeId: place?.id ?? null,
    occasionId: occasion?.id ?? null,
    story: text('story'),
    personIds: person ? [person.id] : [],
    tagIds: tags.map((tag) => tag.id),
  })

  revalidatePath('/timeline')
  revalidatePath('/queue')
  revalidatePath('/accession')
  return result
}

export async function skipItemsAction(itemIds: string[]) {
  const ownerId = await requireOwner()
  await skipIntakeItems(ownerId, itemIds)
  revalidatePath('/queue')
}
