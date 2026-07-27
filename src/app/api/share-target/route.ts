import { put } from '@vercel/blob'
import type { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { extensionOf, intakePath, originalsToken } from '@/server/blob'
import { addIntakeItem, createBatch } from '@/server/intake'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The OS share sheet's landing. Files arrive as multipart form-data *through*
 * this function, which means Vercel's ~4.5 MB body cap applies — fine for a
 * shared JPEG, tight for a HEIC burst. Documented limitation; the in-app
 * uploader (client → Blob direct) has no such cap.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  // A share from a signed-out state still deserves a landing, not a 401 page.
  if (!user) redirect('/sign-in')

  const form = await request.formData()
  const files = form.getAll('photos').filter((f): f is File => f instanceof File)
  if (files.length === 0) redirect('/accession')

  const batch = await createBatch(user.id, 'share_target')
  const token = originalsToken()

  for (const file of files) {
    const blob = await put(
      intakePath(user.id, `shared-${Date.now()}`, `original.${extensionOf(file.name, 'jpg')}`),
      file,
      { access: 'private', token, addRandomSuffix: true, contentType: file.type || undefined },
    )
    await addIntakeItem(user.id, batch.id, { originalUrl: blob.url })
  }

  redirect('/queue')
}
