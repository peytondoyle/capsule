import { getCurrentUser } from '@/server/auth'
import { downloadArchiveMedia } from '@/server/offline-media'
import type { ArchiveAsset } from '@/lib/offline/media'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const headers = { 'cache-control': 'private, no-store' }
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401, headers })
  if (request.headers.get('x-capsule-owner') !== user.id) return new Response('account changed', { status: 409, headers })
  const query = new URL(request.url).searchParams
  try {
    return await downloadArchiveMedia(user.id, { kind: query.get('kind'), id: query.get('id'), variant: query.get('variant'), source: query.get('source') } as ArchiveAsset)
  } catch { return new Response('archive unavailable', { status: 503, headers }) }
}
