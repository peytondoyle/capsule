import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { NextRequest } from 'next/server'

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
 * Ownership is decided here and only here — the pathname is rebuilt from the
 * session rather than trusted from the client, so a caller cannot write into
 * someone else's prefix.
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
        // Whatever the client asked for, it lands under this owner's prefix.
        const safe = pathname.split('/').pop() ?? 'original'
        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'image/avif',
          ],
          addRandomSuffix: true,
          pathname: `intake/${user.id}/${safe}`,
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
