import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { NextRequest } from 'next/server'

import { intakeTokenOptions } from '@/server/blob-upload'
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
      onBeforeGenerateToken: intakeTokenOptions(user.id),
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
