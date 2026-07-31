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
import { timelineHref } from '@/lib/timeline'

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
 * The five fields, saved together.
 *
 * Three-valued on purpose: a field the form did not post is *absent*, which is
 * not the same as one the user cleared. Blank still means "clear this" and
 * normalises to null; absent means "leave it alone" and is omitted from the
 * patch entirely.
 *
 * The distinction is load-bearing because this action has more than one caller
 * and they post different subsets. /o/[lot]'s form posts all seven fields; the
 * Ledger inspector posts six. While every field was written unconditionally,
 * saving from the inspector set retained_location to NULL on every save — "in
 * the blue tin, top shelf" gone, no undo, no other copy. Gating the one field
 * that broke would have left the same trap for the next partial caller, so the
 * rule is uniform.
 */
export async function saveFieldsAction(objectId: string, formData: FormData) {
  const ownerId = await requireOwner()
  const { lotNo } = await assertOwned(ownerId, objectId)

  /** undefined = not posted · null = posted blank · string = a value. */
  const text = (key: string) => {
    if (!formData.has(key)) return undefined
    const value = formData.get(key)
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  /** Includes a patch fragment only when the form actually posted that field. */
  const ifPosted = <T extends object>(key: string, patch: T) =>
    formData.has(key) ? patch : {}

  const receivedAt = text('receivedAt')
  const placeName = text('place')
  const occasionName = text('occasion')

  const [place, occasion] = await Promise.all([
    placeName ? upsertPlace(ownerId, placeName) : null,
    occasionName ? upsertOccasion(ownerId, occasionName) : null,
  ])

  const givenBy = text('givenBy')
  if (givenBy !== undefined) await setGiver(ownerId, objectId, givenBy)

  await updateObject(ownerId, objectId, {
    // A posted-but-blank title falls back rather than clearing: an object with
    // no title has nothing to render in the Ledger.
    ...ifPosted('title', { title: text('title') ?? 'Untitled' }),
    ...ifPosted('story', { story: text('story') ?? null }),
    // The date and its precision move together or not at all — clearing the
    // date has to clear the precision, or the object claims a day it no longer
    // has and drops out of Unfiled while looking undated.
    ...ifPosted('receivedAt', {
      receivedAt: receivedAt ?? null,
      receivedPrecision: receivedAt ? ('day' as const) : ('unknown' as const),
    }),
    ...ifPosted('place', { placeId: place?.id ?? null }),
    ...ifPosted('occasion', { occasionId: occasion?.id ?? null }),
    ...ifPosted('retainedLocation', { retainedLocation: text('retainedLocation') ?? null }),
  })

  refresh(lotNo)

  // The Ledger inspector edits in place, so it has somewhere to go back to;
  // /o/[lot] does not send this and stays where it is, as before.
  //
  // The destination is rebuilt here from lotNo rather than accepted as a URL —
  // a form field is client-controlled, and "return to wherever this says" on a
  // public endpoint is an open redirect.
  if (formData.get('returnTo') === 'timeline') {
    // Rebuilt from lotNo and a closed set of values, never from a supplied URL.
    redirect(
      timelineHref({
        lot: lotNo,
        q: text('returnQ'),
        sort: formData.get('returnSort') === 'oldest' ? 'oldest' : 'newest',
      }),
    )
  }
}
