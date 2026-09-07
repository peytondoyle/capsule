/**
 * The one place the intake prefix is spelled, because three parties have to
 * agree on it and only one of them is on the server.
 *
 * A client upload's pathname is chosen by the browser: `handleUpload` passes
 * the *client's* pathname to `onBeforeGenerateToken` and then puts it back into
 * the issued token, so a `pathname` returned from that callback is discarded
 * (@vercel/blob 2.6.1, client.js — `{...tokenOptions, pathname}`). The server
 * therefore cannot rewrite the path; it can only refuse to issue a token for
 * one that is not this owner's. The client asks for the right path, the route
 * checks it, and assertOwnedOriginalUrl checks it again on the way back in.
 */
export function intakePrefix(ownerId: string) {
  return `intake/${ownerId}/`
}

/** Strips directories and anything that would fight with a URL path. */
export function safeUploadName(filename: string) {
  const base = filename.split('/').pop() ?? 'original'
  const cleaned = base.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'original'
}

export function clientIntakePath(ownerId: string, filename: string) {
  return `${intakePrefix(ownerId)}${safeUploadName(filename)}`
}

export function clientCapturePath(ownerId: string, captureId: string, filename: string) {
  return `${intakePrefix(ownerId)}captures/${captureId}/${safeUploadName(filename)}`
}

export function isClientCapturePath(ownerId: string, pathname: string) {
  const prefix = `${intakePrefix(ownerId)}captures/`
  if (!pathname.startsWith(prefix)) return false
  const [captureId, name, ...rest] = pathname.slice(prefix.length).split('/')
  return Boolean(!rest.length && captureId && name && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(captureId) && name !== '.' && name !== '..' && pathname === clientCapturePath(ownerId, captureId, name))
}
