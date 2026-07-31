import 'server-only'

import { MAX_ORIGINAL_BYTES } from './blob'
import { clientIntakePath } from '@/lib/blob-path'

/**
 * The `onBeforeGenerateToken` callback for client uploads — the single copy.
 *
 * It lives here rather than inline in the route because `db:verify:upload` has
 * to exercise the callback that actually ships. It used to keep its own copy
 * under a comment claiming it "cannot drift from what ships", and it had
 * drifted: two content types against six, and no size cap at all. A gate that
 * asserts against a reimplementation proves the reimplementation.
 *
 * Ownership is enforced by *refusing*, not rewriting. `handleUpload` hands this
 * the client's own pathname and then writes that same value into the issued
 * token (`{...tokenOptions, pathname}`, @vercel/blob 2.6.1 client.js), so a
 * pathname returned from here is silently dropped — and `pathname` is not in
 * the callback's declared return type, so TypeScript never says so. The only
 * real control is which pathnames get a token at all.
 */
export function intakeTokenOptions(ownerId: string) {
  return async (pathname: string) => {
    // Throwing is the enforcement. The token is scoped to this exact pathname,
    // so refusing here is what keeps a caller out of another owner's prefix —
    // and out of the store root, which is where every upload landed while this
    // code believed it was rewriting the path.
    if (pathname !== clientIntakePath(ownerId, pathname)) {
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
      // The token itself refuses an oversized body, so nothing has to trust the
      // client. Without it any signed-in user could park an arbitrarily large
      // object in the private originals store and then replay it through
      // /api/original, which streams it back with the store bearer attached
      // server-side — a bandwidth amplifier. 50 MB clears a 48MP HEIC.
      maximumSizeInBytes: MAX_ORIGINAL_BYTES,
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ ownerId }),
    }
  }
}
