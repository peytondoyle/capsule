import type { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { intakePath } from '@/server/blob'
import { deriveFromOriginal, type Corner } from '@/server/derive'
import { getIntakeItem, updateIntakeItem } from '@/server/intake'

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

  try {
    const derived = await deriveFromOriginal(
      item.originalUrl,
      { ownerId: user.id, key: intakePath(user.id, itemId, '').replace(/\/$/, '') },
      corners ?? (item.corners as Corner[] | null),
    )

    await updateIntakeItem(user.id, itemId, {
      cutoutUrl: derived.cutoutUrl,
      status: 'segmented',
      ...(corners ? { corners: corners as never } : {}),
    })

    return Response.json(derived)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'derive failed' },
      { status: 500 },
    )
  }
}
