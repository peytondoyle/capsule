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
