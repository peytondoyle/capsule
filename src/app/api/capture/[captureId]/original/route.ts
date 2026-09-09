import { getCurrentUser } from '@/server/auth'
import { downloadCaptureOriginal } from '@/server/capture'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401, headers })
  const { captureId } = await params
  try {
    const original = await downloadCaptureOriginal(user.id, captureId)
    if (!original) return new Response('not found', { status: 404, headers })
    return new Response(original.body, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${captureId}.heic"`, 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('unavailable', { status: 502, headers }) }
}
