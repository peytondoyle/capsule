/**
 * HEIC → JPEG, in the browser, before upload.
 *
 * `sharp` cannot decode HEIC and never will here: the bundled libheif ships the
 * AV1 codec only, with no HEVC — `sharp.format.heif.input.fileSuffix` is
 * `['.avif']`. So every HEIC an iPhone produced failed derive server-side and
 * the item silently never got an image. Upgrading sharp does not fix it; the
 * exclusion is a codec-licensing one.
 *
 * Safari and iOS — the browsers that actually produce HEIC — decode it natively,
 * so the conversion happens on the device that already has the codec. That also
 * fixes the corner editor, whose `<img>` could not display a HEIC either.
 *
 * Costs the "never modify the original" rule for HEIC alone, deliberately: an
 * original nothing in the pipeline can read is not an archive, it is a file.
 */

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

export function isHeic(file: File) {
  const type = file.type.toLowerCase()
  if (HEIC_TYPES.includes(type)) return true
  // iOS sometimes hands over an empty or generic type; fall back to the name.
  return type === '' || type === 'application/octet-stream'
    ? /\.hei[cf]$/i.test(file.name)
    : false
}

export type TranscodeResult =
  | { ok: true; file: File; converted: boolean }
  | { ok: false; reason: string }

/**
 * Returns the original untouched for anything that is not HEIC.
 *
 * On failure it reports rather than throwing, because the caller has to be able
 * to tell the user "this browser can't read that photo" instead of parking a
 * file the server will silently fail on.
 */
export async function toUploadable(file: File): Promise<TranscodeResult> {
  if (!isHeic(file)) return { ok: true, file, converted: false }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return { ok: false, reason: 'this browser cannot read HEIC photographs' }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Chrome and Firefox on desktop have no HEIC decoder at all.
    return { ok: false, reason: 'this browser cannot read HEIC photographs' }
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return { ok: false, reason: 'could not convert this photograph' }
    context.drawImage(bitmap, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) =>
      // 0.92 rather than 1: this is the archival original, and the alternative
      // is no image at all, but a lossless re-encode of a 12MP phone photo is
      // ~30MB and the upload has to survive a basement.
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) return { ok: false, reason: 'could not convert this photograph' }

    return {
      ok: true,
      converted: true,
      file: new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }),
    }
  } finally {
    bitmap.close()
  }
}
