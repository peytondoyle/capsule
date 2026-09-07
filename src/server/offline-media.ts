import 'server-only'

import { and, eq } from 'drizzle-orm'
import { getDb } from './db'
import { intakeBatches, intakeItems, objectFaces, objects } from './db/schema'
import { assertOwnedOriginalUrl, mediaToken, originalsToken } from './blob'
import type { ArchiveAsset } from '@/lib/offline/media'

export async function downloadArchiveMedia(ownerId: string, asset: ArchiveAsset) {
  const headers = { 'cache-control': 'private, no-store' }
  if (!['face', 'intake'].includes(asset.kind) || !['original', 'cutout', 'thumb', 'mask'].includes(asset.variant) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asset.id) || !asset.source) return new Response('invalid request', { status: 400, headers })
  const db = getDb()
  const [row] = asset.kind === 'face'
    ? await db.select({ original: objectFaces.originalUrl, cutout: objectFaces.cutoutUrl, thumb: objectFaces.thumbUrl, mask: objectFaces.maskUrl }).from(objectFaces).innerJoin(objects, eq(objects.id, objectFaces.objectId)).where(and(eq(objectFaces.id, asset.id), eq(objects.ownerId, ownerId))).limit(1)
    : await db.select({ original: intakeItems.originalUrl, cutout: intakeItems.cutoutUrl, thumb: intakeItems.thumbUrl }).from(intakeItems).innerJoin(intakeBatches, eq(intakeBatches.id, intakeItems.batchId)).where(and(eq(intakeItems.id, asset.id), eq(intakeBatches.ownerId, ownerId))).limit(1)
  const source = row?.[asset.variant as keyof typeof row]
  if (!source) return new Response('not found', { status: 404, headers })
  if (source !== asset.source) return new Response('photograph changed', { status: 409, headers })
  let token: string | undefined
  try {
    if (asset.variant === 'original') {
      assertOwnedOriginalUrl(ownerId, source)
      token = originalsToken()
    } else {
      const url = new URL(source)
      const host = `${mediaToken().split('_')[3]?.toLowerCase()}.public.blob.vercel-storage.com`
      if (url.protocol !== 'https:' || url.host !== host || url.pathname.includes('%') || ![`/intake/${ownerId}/`, `/objects/${ownerId}/`].some((prefix) => url.pathname.startsWith(prefix))) throw new Error('invalid media URL')
    }
  } catch { return new Response('not found', { status: 404, headers }) }
  try {
    const upstream = await fetch(source, { cache: 'no-store', redirect: 'error', headers: token ? { authorization: `Bearer ${token}` } : undefined })
    if (!upstream.ok || !upstream.body) return new Response('photograph unavailable', { status: 502, headers })
    return new Response(upstream.body, { headers: { ...headers, 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream', 'x-capsule-media-source': source } })
  } catch { return new Response('photograph unavailable', { status: 502, headers }) }
}
