import { getCurrentUser } from '@/server/auth'
import { headers } from 'next/headers'
import { applySyncMutation, getSyncSnapshot } from '@/server/sync'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  if ((await headers()).get('x-capsule-owner') !== user.id) return new Response('owner mismatch', { status: 409 })
  return Response.json(await getSyncSnapshot(user.id), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  if (request.headers.get('x-capsule-owner') !== user.id) return new Response('owner mismatch', { status: 409 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }
  return Response.json(await applySyncMutation(user.id, body), { headers: { 'Cache-Control': 'private, no-store' } })
}
