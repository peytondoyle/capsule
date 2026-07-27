import type { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { extractFromImage, hasExtraction } from '@/server/extract'
import { listPendingIntake, updateIntakeItem } from '@/server/intake'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  // Extraction is optional by design: "TAP WHAT'S TRUE. THE REST CAN WAIT."
  // works with zero machine assistance, so a missing key is a 501, not a crash.
  if (!hasExtraction()) {
    return Response.json({ error: 'extraction not configured' }, { status: 501 })
  }

  const { itemId } = (await request.json()) as { itemId?: string }
  if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 })

  const pending = await listPendingIntake(user.id, 500)
  const match = pending.find((row) => row.item.id === itemId)
  const source = match?.item.cutoutUrl
  if (!source) {
    return Response.json({ error: 'derive the cutout first' }, { status: 409 })
  }

  try {
    const exif = match.item.suggestions as { date?: { value?: string } } | null
    const suggestions = await extractFromImage(source, {
      exifDate: exif?.date?.value ?? null,
    })

    await updateIntakeItem(user.id, itemId, {
      suggestions: suggestions as never,
      status: 'needs_review',
    })

    return Response.json({ suggestions })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'extraction failed' },
      { status: 500 },
    )
  }
}
