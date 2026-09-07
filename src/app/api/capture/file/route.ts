import { getCurrentUser } from '@/server/auth'
import { CaptureFilingConflictError, CaptureFilingInputError, CaptureFilingLimitError, fileCapturedItem } from '@/server/capture-filing'
import type { CaptureDraft } from '@/lib/capture-draft'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  if (request.headers.get('x-capsule-owner') !== user.id) return new Response('owner mismatch', { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const body = await request.json() as { itemId?: string; draft?: CaptureDraft }
    if (!body || typeof body.itemId !== 'string' || !body.draft) throw new CaptureFilingInputError('invalid request')
    return json(await fileCapturedItem(user.id, body.itemId, body.draft))
  } catch (error) {
    if (error instanceof CaptureFilingLimitError) return json({ error: 'try filing later' }, 429)
    return json({ error: error instanceof CaptureFilingConflictError ? 'capture conflict' : error instanceof CaptureFilingInputError || error instanceof SyntaxError ? 'invalid request' : 'capture unavailable' }, error instanceof CaptureFilingConflictError ? 409 : error instanceof CaptureFilingInputError || error instanceof SyntaxError ? 400 : 503)
  }
}
