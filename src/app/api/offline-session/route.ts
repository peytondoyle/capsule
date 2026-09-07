import { getCurrentUser } from '@/server/auth'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!user) return new Response('unauthorized', { status: 401, headers })
  if (request.headers.get('x-capsule-owner') !== user.id) return new Response('owner mismatch', { status: 409, headers })
  return Response.json({ ownerId: user.id }, { headers })
}
