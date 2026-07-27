/**
 * Proof for the client-upload path, which nothing else covers.
 *
 * verify-p6 seeds its intake with a server-side `put()` — the share-target
 * shape. That left the browser's path (`upload()` -> /api/blob/upload ->
 * `recordUploadAction`) untested, and it broke: the route believed
 * `onBeforeGenerateToken` could rewrite the pathname, @vercel/blob discarded
 * the rewrite, every blob landed at the store root, and `assertOwnedOriginalUrl`
 * then rejected the URL the client reported back. Every in-app capture failed
 * and `npm run build && typecheck && lint` all passed, because `pathname` is not
 * in the callback's declared return type.
 *
 * So this asserts the property that actually matters: the pathname baked into
 * the issued client token is under the signed-in owner's prefix, or no token is
 * issued at all.
 */
import { handleUpload } from '@vercel/blob/client'

import { clientIntakePath, intakePrefix } from '../src/lib/blob-path'
import { assertOwnedOriginalUrl, originalsToken } from '../src/server/blob'

const OWNER = 'user_2probeOwner'
const OTHER = 'user_2otherOwner'

let failures = 0
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failures++
}

/** The route's own callback, so this cannot drift from what ships. */
function onBeforeGenerateToken(ownerId: string) {
  return async (pathname: string) => {
    if (pathname !== clientIntakePath(ownerId, pathname)) {
      throw new Error('upload path is not this owner’s intake prefix')
    }
    return {
      allowedContentTypes: ['image/jpeg', 'image/heic'],
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ ownerId }),
    }
  }
}

/** Asks the route for a token exactly the way @vercel/blob's `upload()` does. */
async function requestToken(ownerId: string, clientPathname: string) {
  const result = await handleUpload({
    token: originalsToken(),
    request: new Request('https://capsule.test/api/blob/upload', { method: 'POST' }),
    body: {
      type: 'blob.generate-client-token',
      payload: { pathname: clientPathname, clientPayload: null, multipart: false },
    },
    onBeforeGenerateToken: onBeforeGenerateToken(ownerId),
    // Omitted deliberately: off Vercel the SDK cannot derive a callback URL and
    // warns. It plays no part in which pathname the token carries.
  })
  // vercel_blob_client_{storeId}_{base64(`${signature}.${base64(payload)}`)}
  const outer = (result as { clientToken: string }).clientToken.split('_').pop()!
  const payload = Buffer.from(outer, 'base64').toString().split('.').pop()!
  return JSON.parse(Buffer.from(payload, 'base64').toString()) as { pathname: string }
}

async function main() {
  const wanted = clientIntakePath(OWNER, 'IMG_0042.HEIC')
  check('the helper builds an owner-prefixed path', wanted === `intake/${OWNER}/IMG_0042.HEIC`, wanted)

  const issued = await requestToken(OWNER, wanted)
  check(
    'the issued token keeps the owner prefix',
    issued.pathname.startsWith(intakePrefix(OWNER)),
    issued.pathname,
  )

  // This is the regression itself: the old route returned a rewritten pathname
  // and trusted it. If a future @vercel/blob starts honouring the rewrite this
  // still passes; if it keeps ignoring it, only refusal protects the prefix.
  for (const [label, bad] of [
    ['a bare filename gets no token', 'IMG_0042.HEIC'],
    ['another owner’s prefix gets no token', `intake/${OTHER}/IMG_0042.HEIC`],
    ['a traversal out of the prefix gets no token', `intake/${OWNER}/../${OTHER}/x.jpg`],
    ['the store root gets no token', 'original.jpg'],
  ] as const) {
    let refused = false
    try {
      await requestToken(OWNER, bad)
    } catch {
      refused = true
    }
    check(label, refused, bad)
  }

  // And the URL such an upload produces must survive the check on the way back.
  const host = new URL(
    `https://x.private.blob.vercel-storage.com/${issued.pathname}`,
  )
  const storeId = originalsToken().split('_')[3]!.toLowerCase()
  host.host = `${storeId}.private.blob.vercel-storage.com`
  let accepted = true
  try {
    assertOwnedOriginalUrl(OWNER, host.toString())
  } catch {
    accepted = false
  }
  check('recordUploadAction would accept the resulting URL', accepted, host.pathname)

  let rejected = false
  try {
    assertOwnedOriginalUrl(OTHER, host.toString())
  } catch {
    rejected = true
  }
  check('and would reject it for anyone else', rejected)

  // `..` is normalised out before the prefix check; `%2f` is not, and would
  // leave the pathname looking prefixed while href still carried the escape.
  const storeHost = `${storeId}.private.blob.vercel-storage.com`
  for (const [label, bad] of [
    ['a percent-encoded traversal is rejected', `intake/${OWNER}/..%2f..%2fintake%2f${OTHER}%2fx.jpg`],
    ['a plain traversal is rejected', `intake/${OWNER}/../${OTHER}/x.jpg`],
    ['the public store is rejected', null],
  ] as const) {
    const candidate =
      bad === null
        ? `https://${storeId}.public.blob.vercel-storage.com/intake/${OWNER}/x.jpg`
        : `https://${storeHost}/${bad}`
    let refused = false
    try {
      assertOwnedOriginalUrl(OWNER, candidate)
    } catch {
      refused = true
    }
    check(label, refused)
  }

  let foreignHost = false
  try {
    assertOwnedOriginalUrl(OWNER, `https://${storeHost}@evil.example/intake/${OWNER}/x.jpg`)
  } catch {
    foreignHost = true
  }
  check('a userinfo-smuggled host is rejected', foreignHost)

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`)
  return failures
}

main().then(
  (n) => process.exit(n ? 1 : 0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
