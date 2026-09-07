import 'server-only'

import { solveHomography, type Point } from '@/lib/crop-geometry'

export { isSaneQuad, orderCorners, recoverAspect, solveHomography, type Point } from '@/lib/crop-geometry'

export function warpPerspective(src: Buffer, srcW: number, srcH: number, channels: number, quad: Point[], outW: number, outH: number): Buffer {
  const H = solveHomography(quad, outW, outH), out = Buffer.allocUnsafe(outW * outH * channels)
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const w = H[6] * x + H[7] * y + 1, sx = (H[0] * x + H[1] * y + H[2]) / w, sy = (H[3] * x + H[4] * y + H[5]) / w, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, offset = (y * outW + x) * channels
    if (x0 < 0 || y0 < 0 || x0 + 1 >= srcW || y0 + 1 >= srcH) { for (let c = 0; c < channels; c++) out[offset + c] = 255; continue }
    const i00 = (y0 * srcW + x0) * channels, i10 = i00 + channels, i01 = i00 + srcW * channels, i11 = i01 + channels
    for (let c = 0; c < channels; c++) { const top = src[i00 + c]! * (1 - fx) + src[i10 + c]! * fx, bottom = src[i01 + c]! * (1 - fx) + src[i11 + c]! * fx; out[offset + c] = Math.round(top * (1 - fy) + bottom * fy) }
  }
  return out
}
