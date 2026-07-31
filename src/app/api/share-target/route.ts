import { put } from '@vercel/blob'
import type { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth'
import { extensionOf, intakePath, originalsToken } from '@/server/blob'
import { addIntakeItem, createBatch, updateIntakeItem } from '@/server/intake'
import { deriveFromOriginal } from '@/server/derive'

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
    const item = await addIntakeItem(user.id, batch.id, { originalUrl: blob.url })

    // Derive inline. The in-app uploader fires /api/derive from the browser
    // afterwards; a share has no browser of its own to do that, so without this
    // a shared photo filed as an object with no image at all — and the Filer
    // will happily file it, since an item is queue-visible from the moment it
    // is recorded. The bytes already came through this function (Vercel's
    // ~4.5 MB body cap bounds them) and the route has maxDuration 60.
    try {
      const derived = await deriveFromOriginal(blob.url, {
        ownerId: user.id,
        key: intakePath(user.id, item.id, '').replace(/\/$/, ''),
      })
      await updateIntakeItem(user.id, item.id, {
        cutoutUrl: derived.cutoutUrl,
        thumbUrl: derived.thumbUrl,
        width: derived.width,
        height: derived.height,
        status: 'segmented',
      })
    } catch {
      // A failed derive leaves a filable item with no cutout, which the Filer
      // already labels "not cut out yet" and the corner editor can repair.
      // Losing the whole share because one photo would not decode is worse.
    }
  }

  redirect('/queue')
}
