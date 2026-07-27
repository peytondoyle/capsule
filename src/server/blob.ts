import 'server-only'

/**
 * Two stores, because access is a property of the *store* in Vercel Blob, not
 * of the individual blob: private stores serve from
 * `{id}.private.blob.vercel-storage.com` behind a bearer token, public ones
 * from `{id}.public…`.
 *
 *   capsule-originals (private)  the untouched camera bytes, never served direct
 *   capsule-media     (public)   cutouts, masks, thumbs — the hot, CDN path
 */

export const MEDIA_TOKEN_ENV = 'BLOB_READ_WRITE_TOKEN'
export const ORIGINALS_TOKEN_ENV = 'BLOB_ORIGINALS_READ_WRITE_TOKEN'

export function mediaToken() {
  const token = process.env[MEDIA_TOKEN_ENV]
  if (!token) throw new Error(`${MEDIA_TOKEN_ENV} is not set`)
  return token
}

/**
 * Connecting a second Blob store to a project needs a custom env-var prefix,
 * which Vercel CLI 56.x cannot set — it is a dashboard step (see docs/HANDOFF.md).
 * Until it is done, originals have nowhere private to go, so ingest refuses
 * rather than quietly writing someone's photographs to a public bucket.
 */
export function originalsToken() {
  const token = process.env[ORIGINALS_TOKEN_ENV]
  if (!token) {
    throw new Error(
      `${ORIGINALS_TOKEN_ENV} is not set — connect the capsule-originals Blob store ` +
        `to this project with the ${ORIGINALS_TOKEN_ENV.replace('_READ_WRITE_TOKEN', '_')} prefix.`,
    )
  }
  return token
}

export function hasOriginalsStore() {
  return Boolean(process.env[ORIGINALS_TOKEN_ENV])
}

/**
 * Deterministic paths: no random suffix, so a face's derivatives are derivable
 * from its id and a failed job can be retried without orphaning what it wrote.
 */
export function facePath(
  ownerId: string,
  objectId: string,
  faceId: string,
  name: string,
) {
  return `objects/${ownerId}/${objectId}/${faceId}/${name}`
}

export function intakePath(ownerId: string, itemId: string, name: string) {
  return `intake/${ownerId}/${itemId}/${name}`
}

/** Keeps the original extension so HEIC stays HEIC until sharp converts it. */
export function extensionOf(filename: string, fallback = 'bin') {
  const match = /\.([a-z0-9]+)$/i.exec(filename)
  return (match?.[1] ?? fallback).toLowerCase()
}

/**
 * The host a store's blobs must live on, derived from its own token.
 *
 * Tokens are `vercel_blob_rw_<STOREID>_<secret>`, and a store serves from
 * `<storeid>.private|public.blob.vercel-storage.com`. Deriving it means the
 * check cannot drift from whichever store is actually configured.
 */
function hostForToken(token: string, access: 'private' | 'public') {
  const storeId = token.split('_')[3]
  if (!storeId) throw new Error('malformed blob token')
  return `${storeId.toLowerCase()}.${access}.blob.vercel-storage.com`
}

/**
 * Asserts a URL really is this owner's original before anything attaches a
 * bearer token to it.
 *
 * Without this the stored URL is client-controlled: /api/blob/upload rebuilds
 * the pathname from the session, but the client reports the resulting URL
 * afterwards and can simply substitute another one. Any sink that then fetches
 * it with `Bearer originalsToken()` would hand a store-wide read/write token —
 * every user's private photographs — to an arbitrary host, and stream the
 * response back as a bonus. Both the source (addIntakeItem) and the sinks
 * (deriveFromOriginal, /api/original) call this.
 */
export function assertOwnedOriginalUrl(ownerId: string, url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('original url is not a url')
  }

  const expectedHost = hostForToken(originalsToken(), 'private')
  if (parsed.protocol !== 'https:' || parsed.host !== expectedHost) {
    throw new Error('original url is not on the originals store')
  }

  // `intake/{ownerId}/…` is what /api/blob/upload and the share target write.
  const prefix = `/intake/${ownerId}/`
  if (!parsed.pathname.startsWith(prefix)) {
    throw new Error('original url does not belong to this owner')
  }

  return url
}

/**
 * Best-effort removal from both stores.
 *
 * Never throws: the caller is usually mid-delete, and a blob that outlives its
 * row is a billing nuisance a sweep can fix, while a throw here would strand
 * the row and leave someone unable to delete their own object.
 */
export async function deleteBlobs(urls: {
  originals?: (string | null)[]
  media?: (string | null)[]
}) {
  const { del } = await import('@vercel/blob')

  const jobs: Array<Promise<unknown>> = []
  const push = (list: (string | null)[] | undefined, token: string) => {
    for (const url of list ?? []) {
      if (url) jobs.push(del(url, { token }).catch(() => undefined))
    }
  }

  try {
    if (urls.originals?.some(Boolean)) push(urls.originals, originalsToken())
  } catch {
    // originals store not configured — nothing to clean there
  }
  try {
    if (urls.media?.some(Boolean)) push(urls.media, mediaToken())
  } catch {
    // media store not configured
  }

  await Promise.all(jobs)
}
