import 'server-only'

import { createHash } from 'node:crypto'
import { BlobNotFoundError, head } from '@vercel/blob'
import type { CaptureOriginal } from '@/lib/capture-types'
import { clientCaptureOriginalPath } from '@/lib/blob-path'
import { assertOwnedOriginalUrl, originalsToken, MAX_ORIGINAL_BYTES } from './blob'

export async function readCaptureOriginal(ownerId: string, captureId: string) {
  const pathname = clientCaptureOriginalPath(ownerId, captureId)
  let url: string
  try { url = (await head(pathname, { token: originalsToken() })).url }
  catch (error) { if (error instanceof BlobNotFoundError) return null; throw error }
  assertOwnedOriginalUrl(ownerId, url)
  if (new URL(url).pathname !== `/${pathname}`) throw new Error('camera original path mismatch')
  const response = await fetch(url, { headers: { authorization: `Bearer ${originalsToken()}` }, cache: 'no-store', redirect: 'error' })
  if (!response.ok || !response.body) throw new Error('camera original unavailable')
  return response
}

export async function confirmCaptureOriginal(ownerId: string, captureId: string, expected: CaptureOriginal) {
  const response = await readCaptureOriginal(ownerId, captureId)
  if (!response) return null
  const reader = response.body!.getReader(), hash = createHash('sha256')
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > expected.size || size > MAX_ORIGINAL_BYTES) throw new Error('camera original bytes do not match')
      hash.update(chunk.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const sha256 = hash.digest('hex')
  if (size !== expected.size || sha256 !== expected.sha256) throw new Error('camera original bytes do not match')
  return { size, sha256 }
}
