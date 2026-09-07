import { getCurrentUser } from '@/server/auth'
import { FaceConflictError, FaceInputError, FaceLimitError, saveCapturedFace } from '@/server/capture-face'
import type { FaceRequest } from '@/lib/face-draft'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  const user = await getCurrentUser()
  if (!user) return json({ error: 'unauthorized' }, 401)
  if (request.headers.get('x-capsule-owner') !== user.id) return json({ error: 'owner mismatch' }, 409)
  try { return json(await saveCapturedFace(user.id, await request.json() as FaceRequest)) }
  catch (error) {
    if (error instanceof FaceConflictError) return json({ conflict: error.conflict }, 409)
    return json({ error: error instanceof FaceLimitError ? 'try later' : error instanceof FaceInputError || error instanceof SyntaxError ? 'invalid request' : 'photo unavailable' }, error instanceof FaceLimitError ? 429 : error instanceof FaceInputError || error instanceof SyntaxError ? 400 : 503)
  }
}
