import 'server-only'

import { put } from '@vercel/blob'
import sharp from 'sharp'

import { mediaToken, originalsToken } from './blob'

export type Corner = { x: number; y: number }

/**
 * Turns an original into the derivatives the app actually renders.
 *
 * Deliberately does **not** bake an alpha silhouette. The design system already
 * clips every cutout with CSS `clip-path` / `border-radius`, so baking the
 * shape here would duplicate it, make the stored image useless if the user
 * later changes the cut style, and cost quality on every re-encode. Baked alpha
 * is only needed for `loose` cuts of three-dimensional objects, which is a
 * matting problem, not a cropping one.
 */
export async function deriveFromOriginal(
  originalUrl: string,
  target: { ownerId: string; key: string },
  corners?: Corner[] | null,
) {
  const response = await fetch(originalUrl, {
    headers: { authorization: `Bearer ${originalsToken()}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`could not read the original (${response.status})`)

  const input = Buffer.from(await response.arrayBuffer())

  // `rotate()` with no argument applies the EXIF orientation — without it every
  // portrait phone photo lands on its side.
  let image = sharp(input, { failOn: 'none' }).rotate()
  const meta = await image.metadata()
  const fullWidth = meta.width ?? 0
  const fullHeight = meta.height ?? 0

  if (corners?.length === 4 && fullWidth && fullHeight) {
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    // Corners arrive normalised 0–1 so they survive any later resize.
    const left = Math.max(0, Math.round(Math.min(...xs) * fullWidth))
    const top = Math.max(0, Math.round(Math.min(...ys) * fullHeight))
    const width = Math.min(fullWidth - left, Math.round((Math.max(...xs) - Math.min(...xs)) * fullWidth))
    const height = Math.min(fullHeight - top, Math.round((Math.max(...ys) - Math.min(...ys)) * fullHeight))
    if (width > 8 && height > 8) {
      image = image.extract({ left, top, width, height })
    }
  }

  const base = image.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })

  const [cutout, thumb] = await Promise.all([
    base.clone().webp({ quality: 82 }).toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  ])

  const token = mediaToken()
  const shared = { access: 'public' as const, token, addRandomSuffix: false, allowOverwrite: true }

  const [cutoutBlob, thumbBlob] = await Promise.all([
    put(`${target.key}/cutout.webp`, cutout.data, { ...shared, contentType: 'image/webp' }),
    put(`${target.key}/t640.webp`, thumb, { ...shared, contentType: 'image/webp' }),
  ])

  return {
    cutoutUrl: cutoutBlob.url,
    thumbUrl: thumbBlob.url,
    width: cutout.info.width,
    height: cutout.info.height,
    bytes: cutout.info.size,
  }
}
