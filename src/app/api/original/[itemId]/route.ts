import type { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { assertOwnedOriginalUrl, originalsToken } from '@/server/blob'
import { getIntakeItem } from '@/server/intake'

export const runtime = 'nodejs'

/**
 * Streams a private original to its owner.
 *
 * The originals store is never served directly — this is the one door, and the
 * ownership check is the lock. The corner editor needs to *display* the
 * original, which an <img> against the private URL cannot do.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const { itemId } = await params
  const item = await getIntakeItem(user.id, itemId)
  if (!item?.originalUrl) return new Response('not found', { status: 404 })

  // Re-prove ownership of the URL itself, not just of the row holding it.
  try {
    assertOwnedOriginalUrl(user.id, item.originalUrl)
  } catch {
    return new Response('not found', { status: 404 })
  }

  const upstream = await fetch(item.originalUrl, {
    headers: { authorization: `Bearer ${originalsToken()}` },
    cache: 'no-store',
  })
  if (!upstream.ok || !upstream.body) return new Response('unavailable', { status: 502 })

  return new Response(upstream.body, {
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      // Owner-only, so any shared cache must not keep it.
      'cache-control': 'private, max-age=300',
    },
  })
}
