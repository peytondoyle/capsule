import { getCurrentUser } from '@/server/auth'
import { CaptureInputError, assertCaptureInput, captureStatus, finishCapture } from '@/server/capture'
import type { CaptureRequest } from '@/lib/capture-types'

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  if (request.headers.get('x-capsule-owner') !== user.id) return new Response('owner mismatch', { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
  let body: CaptureRequest
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'invalid request' }, 400)
    body = value as CaptureRequest
  } catch {
    return json({ error: 'invalid request' }, 400)
  }
  try {
    assertCaptureInput(body.captureId, body.name, body.exif)
    return body.action === 'status' ? json(await captureStatus(user.id, body.captureId, body.name)) : body.action === 'finish' ? json(await finishCapture(user.id, body.captureId, body.name, body.exif)) : json({ error: 'invalid request' }, 400)
  } catch (error) {
    return json({ error: error instanceof CaptureInputError ? 'invalid request' : 'capture unavailable' }, error instanceof CaptureInputError ? 400 : 503)
  }
}
