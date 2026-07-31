import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { NextRequest } from 'next/server'

import { MAX_ORIGINAL_BYTES } from '@/server/blob'
import { clientIntakePath } from '@/lib/blob-path'
import { getCurrentUser } from '@/server/auth'
import { hasOriginalsStore, originalsToken } from '@/server/blob'

export const runtime = 'nodejs'

/**
 * Token endpoint for client uploads.
 *
 * The bytes never pass through this function: a Vercel Function body caps at
 * 4.5 MB and a HEIC burst from an iPhone blows straight through it. The client
 * asks here for a short-lived token, then PUTs directly to Blob.
 *
 * Ownership is decided here and only here. It is enforced by *refusing* rather
 * than rewriting: `handleUpload` hands `onBeforeGenerateToken` the client's own
 * pathname and then writes that same value into the issued token
 * (`{...tokenOptions, pathname}`, @vercel/blob 2.6.1 client.js), so a pathname
 * returned from this callback is silently dropped — and `pathname` is not even
 * in the callback's declared return type, so TypeScript never says so. The only
 * real control is which pathnames get a token at all.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  if (!hasOriginalsStore()) {
    return Response.json(
      { error: 'originals store not connected' },
      { status: 503 },
    )
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      token: originalsToken(),
      onBeforeGenerateToken: async (pathname) => {
        // Throwing is the enforcement. The token is scoped to this exact
        // pathname, so refusing here is what keeps a caller out of another
        // owner's prefix — and out of the store root, which is where every
        // upload landed while this code believed it was rewriting the path.
        if (pathname !== clientIntakePath(user.id, pathname)) {
          throw new Error('upload path is not this owner’s intake prefix')
        }
        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'image/avif',
          ],
          // The token itself refuses an oversized body, so nothing has to
          // trust the client. Without it any signed-in user could park an
          // arbitrarily large object in the private originals store and then
          // replay it through /api/original, which streams it back with the
          // store bearer attached server-side — a bandwidth amplifier.
          // 50 MB clears a 48MP HEIC with room to spare.
          maximumSizeInBytes: MAX_ORIGINAL_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ownerId: user.id }),
        }
      },
      onUploadCompleted: async () => {
        // The intake row is created by the client action once it has the URL;
        // this callback does not fire on localhost, so nothing may depend on it.
      },
    })

    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'upload failed' },
      { status: 400 },
    )
  }
}
