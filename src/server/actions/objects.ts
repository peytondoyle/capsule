'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import {
  assertOwned,
  attachTag,
  detachTag,
  setGiver,
  updateObject,
} from '@/server/objects'
import { upsertOccasion, upsertPlace } from '@/server/taxonomy'

/**
 * A Server Action is a public HTTP endpoint. The owner is therefore always
 * re-derived from the session here and never accepted as an argument — with RLS
 * gone, this function is the only thing standing between a forged object id and
 * someone else's archive.
 */
async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) throw new Error('not signed in')
  return user.id
}

function refresh(lotNo: number) {
  revalidatePath('/timeline')
  revalidatePath(`/o/${lotNo}`)
}

export async function setRetentionAction(
  objectId: string,
  retention: 'retained' | 'digital_only',
  retainedLocation?: string | null,
) {
  const ownerId = await requireOwner()
  const { lotNo } = await assertOwned(ownerId, objectId)

  await updateObject(ownerId, objectId, {
    retention,
    // "Only here now" means the physical object is gone, so a shelf location
    // would be a lie. Clear it rather than leave it stale.
    ...(retention === 'digital_only'
      ? { retainedLocation: null }
      : retainedLocation === undefined
        ? {}
        : { retainedLocation }),
  })

  refresh(lotNo)
}

export async function addTagAction(objectId: string, name: string) {
  const ownerId = await requireOwner()
  const { lotNo } = await assertOwned(ownerId, objectId)
  await attachTag(ownerId, objectId, name)
  refresh(lotNo)
}

export async function removeTagAction(objectId: string, tagId: string) {
  const ownerId = await requireOwner()
  const { lotNo } = await assertOwned(ownerId, objectId)
  await detachTag(ownerId, objectId, tagId)
  refresh(lotNo)
}

/**
 * The five fields, saved together. Blank strings mean "clear this", which is
 * different from leaving a field alone, so they normalise to null rather than
 * being dropped.
 */
export async function saveFieldsAction(objectId: string, formData: FormData) {
  const ownerId = await requireOwner()
  const { lotNo } = await assertOwned(ownerId, objectId)

  const text = (key: string) => {
    const value = formData.get(key)
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  const receivedAt = text('receivedAt')
  const placeName = text('place')
  const occasionName = text('occasion')

  const [place, occasion] = await Promise.all([
    placeName ? upsertPlace(ownerId, placeName) : null,
    occasionName ? upsertOccasion(ownerId, occasionName) : null,
  ])

  await setGiver(ownerId, objectId, text('givenBy'))

  await updateObject(ownerId, objectId, {
    title: text('title') ?? 'Untitled',
    story: text('story'),
    receivedAt,
    // Clearing the date has to clear the precision too, or the object claims a
    // day it no longer has and drops out of Unfiled while looking undated.
    receivedPrecision: receivedAt ? 'day' : 'unknown',
    placeId: place?.id ?? null,
    occasionId: occasion?.id ?? null,
    // Presence-gated, unlike every other field here, because this action now has
    // two callers that post different subsets. /o/[lot]'s form has the field, so
    // for it a blank still means "clear this". The Ledger inspector does not, and
    // an absent field read through text() is indistinguishable from a cleared
    // one — so writing it unconditionally silently erased "in the blue tin, top
    // shelf" on every save from the inspector, with no undo and no other copy.
    ...(formData.has('retainedLocation')
      ? { retainedLocation: text('retainedLocation') }
      : {}),
  })

  refresh(lotNo)

  // The Ledger inspector edits in place, so it has somewhere to go back to;
  // /o/[lot] does not send this and stays where it is, as before.
  //
  // The destination is rebuilt here from lotNo rather than accepted as a URL —
  // a form field is client-controlled, and "return to wherever this says" on a
  // public endpoint is an open redirect.
  if (formData.get('returnTo') === 'timeline') {
    const q = text('returnQ')
    // Rebuilt from lotNo and a closed set of values, never from a supplied URL.
    const params = new URLSearchParams({ lot: String(lotNo) })
    if (q) params.set('q', q)
    if (formData.get('returnSort') === 'oldest') params.set('sort', 'oldest')
    redirect(`/timeline?${params}`)
  }
}
