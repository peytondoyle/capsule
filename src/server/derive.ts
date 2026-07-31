import 'server-only'

import { put } from '@vercel/blob'
import sharp from 'sharp'

import { MAX_ORIGINAL_BYTES, assertOwnedOriginalUrl, mediaToken, originalsToken } from './blob'
import { isSaneQuad, orderCorners, recoverAspect, warpPerspective } from './warp'

/**
 * The camera's focal length, in pixels of this image — the one number that
 * disambiguates aspect recovery when the photo was tilted about a single axis
 * (a phone held square to a flat object and pitched down, i.e. most of this
 * archive). FocalLengthIn35mmFormat is relative to the 43.27mm full-frame
 * diagonal, so it converts through the image's own diagonal.
 */
async function focalPxFromExif(input: Buffer, width: number, height: number) {
  try {
    const { default: exifr } = await import('exifr')
    const exif = (await exifr.parse(input, ['FocalLengthIn35mmFormat'])) as {
      FocalLengthIn35mmFormat?: number
    } | null
    const f35 = exif?.FocalLengthIn35mmFormat
    if (!f35 || f35 <= 0) return undefined
    return (f35 * Math.hypot(width, height)) / 43.266615
  } catch {
    return undefined
  }
}

export type Corner = { x: number; y: number }

/**
 * On Vercel, sharp hands back Buffers backed by a SharedArrayBuffer (it runs
 * with worker threads there), and undici refuses SAB-backed views as request
 * bodies — so putting sharp output straight into `put()` throws
 * "ArrayBuffer: SharedArrayBuffer is not allowed" in production only. Copy into
 * a pool-allocated plain Buffer first.
 */
function plain(buffer: Buffer) {
  const copy = Buffer.allocUnsafe(buffer.length)
  buffer.copy(copy)
  return copy
}

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
  // Defence in depth: never attach the store-wide token to a URL we have not
  // just re-proved belongs to this owner, even though intake validates on write.
  assertOwnedOriginalUrl(target.ownerId, originalUrl)

  const response = await fetch(originalUrl, {
    headers: { authorization: `Bearer ${originalsToken()}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`could not read the original (${response.status})`)

  // response.bytes(), not Buffer.from(arrayBuffer()): on Vercel's Node runtime
  // the body can be backed by a SharedArrayBuffer, which Buffer.from refuses
  // ("SharedArrayBuffer is not allowed"). bytes() copies into a plain Uint8Array.
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_ORIGINAL_BYTES) {
    throw new Error('original is too large to derive')
  }

  const input = Buffer.from(await response.bytes())
  // Belt and braces: content-length can be absent or lie.
  if (input.byteLength > MAX_ORIGINAL_BYTES) {
    throw new Error('original is too large to derive')
  }

  // `rotate()` with no argument applies the EXIF orientation — without it every
  // portrait phone photo lands on its side.
  let image = sharp(input, { failOn: 'none' }).rotate()
  const meta = await image.metadata()

  // metadata().width/height deliberately ignore EXIF orientation, but .rotate()
  // above has already applied it — so for any orientation 5–8 photo (an iPhone
  // portrait, i.e. most of them) the stored dimensions are swapped relative to
  // what the user framed in the corner editor. Using them would crop the wrong
  // region, and a `left` scaled by the larger axis can exceed the rotated
  // width and make extract() throw outright.
  const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height }
  const fullWidth = oriented.width ?? 0
  const fullHeight = oriented.height ?? 0

  if (corners?.length === 4 && fullWidth && fullHeight) {
    // Corners arrive normalised 0–1 so they survive any later resize.
    const quad = orderCorners(
      corners.map((c) => ({ x: c.x * fullWidth, y: c.y * fullHeight })),
    )

    if (isSaneQuad(quad.map((c) => ({ x: c.x / fullWidth, y: c.y / fullHeight })))) {
      // A real perspective unwarp, not the old bounding-box crop — which made
      // "DRAG A CORNER TO CORRECT" a lie: it took min/max of the corners and
      // extract()ed the axis-aligned rectangle, so a skewed photo stayed
      // skewed, just tighter. sharp cannot do this itself (see warp.ts).
      const focalPx = await focalPxFromExif(input, fullWidth, fullHeight)
      const aspect = recoverAspect(quad, fullWidth, fullHeight, focalPx)

      // Output sized from the quad's own pixel area, shaped to the recovered
      // aspect, capped at 1600 — the warp equivalent of withoutEnlargement.
      // Normalising to 1600 unconditionally upscaled small crops, which the P6
      // gate's "corner correction re-derives smaller" caught immediately.
      let quadArea = 0
      for (let i = 0; i < 4; i++) {
        const a = quad[i]!
        const b = quad[(i + 1) % 4]!
        quadArea += a.x * b.y - b.x * a.y
      }
      quadArea = Math.abs(quadArea / 2)
      const fitScale = Math.min(1, 1600 / Math.sqrt(quadArea * Math.max(aspect, 1 / aspect)))
      const outW = Math.max(64, Math.round(Math.sqrt(quadArea * aspect) * fitScale))
      const outH = Math.max(64, Math.round(Math.sqrt(quadArea / aspect) * fitScale))

      // Pre-shrink so the bilinear sampler never minifies by more than ~1.4×,
      // which is where it starts to alias — and so a 48MP original does not
      // become a 150MB raw buffer.
      const longestEdge = Math.max(
        Math.hypot(quad[1]!.x - quad[0]!.x, quad[1]!.y - quad[0]!.y),
        Math.hypot(quad[2]!.x - quad[3]!.x, quad[2]!.y - quad[3]!.y),
        Math.hypot(quad[3]!.x - quad[0]!.x, quad[3]!.y - quad[0]!.y),
        Math.hypot(quad[2]!.x - quad[1]!.x, quad[2]!.y - quad[1]!.y),
      )
      const prescale = Math.min(1, (Math.max(outW, outH) * 1.4) / Math.max(1, longestEdge))
      const workW = Math.max(1, Math.round(fullWidth * prescale))
      const workH = Math.max(1, Math.round(fullHeight * prescale))

      const { data, info } = await image
        .clone()
        .resize({ width: workW, height: workH, fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const scaled = quad.map((c) => ({
        x: (c.x / fullWidth) * info.width,
        y: (c.y / fullHeight) * info.height,
      }))
      const warped = warpPerspective(
        data,
        info.width,
        info.height,
        info.channels,
        scaled,
        outW,
        outH,
      )
      image = sharp(warped, { raw: { width: outW, height: outH, channels: 3 } })
    } else {
      // Degenerate quad (bowtie, sliver): fall back to the old bounding box
      // rather than produce garbage or refuse the derive outright.
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      const left = Math.max(0, Math.round(Math.min(...xs) * fullWidth))
      const top = Math.max(0, Math.round(Math.min(...ys) * fullHeight))
      const width = Math.min(fullWidth - left, Math.round((Math.max(...xs) - Math.min(...xs)) * fullWidth))
      const height = Math.min(fullHeight - top, Math.round((Math.max(...ys) - Math.min(...ys)) * fullHeight))
      if (width > 8 && height > 8) {
        image = image.extract({ left, top, width, height })
      }
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
  // Random-suffixed, never overwritten. Deterministic paths with allowOverwrite
  // were two bugs in one: a re-cut wrote byte-identical URLs that the CDN kept
  // serving stale for 30 days (the cut appeared to do nothing), and a local dev
  // session pointed at the production store could clobber live image bytes in
  // place. New writes now always mint new URLs — the rows store them, so
  // nothing needs to derive them — and stale pairs are the caller's to delete
  // once its rows point at the new ones. (thumbBesideCutout still understands
  // the OLD deterministic layout, which every pre-existing face has.)
  const stamp = Date.now().toString(36)
  const shared = { access: 'public' as const, token, addRandomSuffix: true }

  const [cutoutBlob, thumbBlob] = await Promise.all([
    put(`${target.key}/cutout-${stamp}.webp`, plain(cutout.data), { ...shared, contentType: 'image/webp' }),
    put(`${target.key}/t640-${stamp}.webp`, plain(thumb), { ...shared, contentType: 'image/webp' }),
  ])

  return {
    cutoutUrl: cutoutBlob.url,
    thumbUrl: thumbBlob.url,
    width: cutout.info.width,
    height: cutout.info.height,
    bytes: cutout.info.size,
  }
}
