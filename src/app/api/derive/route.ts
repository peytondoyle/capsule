import type { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { deleteBlobs, thumbBesideCutout } from '@/server/blob'
import { consume, tooManyRequests } from '@/server/limits'
import { intakePath } from '@/server/blob'
import { deriveFromOriginal, type Corner } from '@/server/derive'
import { getIntakeItem, repairObjectFace, updateIntakeItem } from '@/server/intake'

// sharp is native, so this cannot run on the edge.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Produces the cutout and thumbnail for one intake item.
 *
 * A route rather than a Server Action because it is genuinely slow (fetch the
 * original, decode, re-encode twice, two uploads) and because the offline queue
 * needs something it can retry with a plain fetch.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const { itemId, corners } = (await request.json()) as {
    itemId?: string
    corners?: Corner[] | null
  }
  if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 })

  const item = await getIntakeItem(user.id, itemId)
  if (!item?.originalUrl) {
    return Response.json({ error: 'item not found' }, { status: 404 })
  }

  // sharp decode + two WebP encodes + two Blob writes per call, and the route
  // is reachable by anyone who can sign up.
  const limit = await consume(user.id, 'derive')
  if (!limit.ok) return tooManyRequests(limit)

  try {
    const derived = await deriveFromOriginal(
      item.originalUrl,
      { ownerId: user.id, key: intakePath(user.id, itemId, '').replace(/\/$/, '') },
      corners ?? (item.corners as Corner[] | null),
    )

    // All four, not just the cutout. thumbUrl/width/height used to be returned
    // to the browser and dropped, so the 640px thumbnail was written to Blob on
    // every derive and referenced by nothing, and every object rendered at the
    // fallback aspect because no face ever had real dimensions.
    await updateIntakeItem(user.id, itemId, {
      cutoutUrl: derived.cutoutUrl,
      thumbUrl: derived.thumbUrl,
      width: derived.width,
      height: derived.height,
      status: 'segmented',
      ...(corners ? { corners: corners as never } : {}),
    })

    // An item is filable from the moment it is recorded, before any derive, and
    // fileIntakeItem copies the URLs it can see at that instant. Without this
    // write-through an object filed during its own derive keeps a face pointing
    // at nothing, on every surface, permanently — the derive lands in
    // intake_items, which nothing reads again once the item is filed.
    if (item.objectId) await repairObjectFace(user.id, item.objectId, derived)

    // Derivatives are never overwritten (see deriveFromOriginal), so a re-cut
    // leaves the previous pair orphaned. Delete it only after both rows point
    // at the new URLs; best-effort, because a leaked blob is a sweepable
    // nuisance and a throw here would fail a derive that already succeeded.
    if (item.cutoutUrl && item.cutoutUrl !== derived.cutoutUrl) {
      await deleteBlobs({ media: [item.cutoutUrl, item.thumbUrl ?? thumbBesideCutout(item.cutoutUrl)] })
    }

    return Response.json(derived)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'derive failed' },
      { status: 500 },
    )
  }
}
