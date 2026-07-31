import 'server-only'

/**
 * Perspective correction for a photographed flat object.
 *
 * sharp cannot do this: libvips' mapim/quadratic are not bound (both are
 * `undefined` on sharp.prototype at 0.35.3), and affine() is 6 DOF — fully
 * determined by three corners, parallelism-preserving, so the most general
 * shape it can map a rectangle onto is a parallelogram. A camera viewing a
 * plane obliquely makes opposite edges converge; undoing that needs the
 * perspective divide, the two extra DOF in a homography's bottom row. So the
 * warp is done here, in plain JS, over a raw pixel buffer — ~44ms at a 1600px
 * output, scaling with output pixels rather than input.
 */

export type Point = { x: number; y: number }

/** Row-major 3×3 homography. */
type Homography = [number, number, number, number, number, number, number, number, number]

/**
 * Orders four arbitrary points TL, TR, BR, BL by angle around their centroid,
 * so a user who dragged handles across each other still describes a sane quad.
 */
export function orderCorners(corners: Point[]): Point[] {
  const cx = corners.reduce((sum, c) => sum + c.x, 0) / corners.length
  const cy = corners.reduce((sum, c) => sum + c.y, 0) / corners.length
  const byAngle = [...corners].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )
  // atan2 order starting at -π is [TL, TR, BR, BL] only when the first point is
  // top-left; rotate so the point with the smallest x+y leads.
  let lead = 0
  for (let i = 1; i < 4; i++) {
    const p = byAngle[i]!
    const l = byAngle[lead]!
    if (p.x + p.y < l.x + l.y) lead = i
  }
  return [0, 1, 2, 3].map((i) => byAngle[(lead + i) % 4]!)
}

/**
 * A quad is warpable when it is convex and not degenerate. A bowtie (handles
 * dragged across each other) or a sliver produces a garbage homography rather
 * than an error, so it is rejected here and the caller falls back to the
 * bounding-box crop.
 */
export function isSaneQuad(quad: Point[], minArea = 0.01): boolean {
  if (quad.length !== 4) return false
  let area = 0
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!
    const b = quad[(i + 1) % 4]!
    const c = quad[(i + 2) % 4]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (cross !== 0) {
      const s = Math.sign(cross)
      if (sign === 0) sign = s
      else if (s !== sign) return false // non-convex
    }
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area / 2) >= minArea
}

/**
 * The output rectangle's aspect ratio, recovered from the quad.
 *
 * Averaging opposite edge lengths — the obvious answer — is measurably wrong
 * the moment the photo was taken at an angle: -8.6% on a boarding-pass shape in
 * the prototype. Zhang & He's whiteboard method recovers the true ratio from
 * the perspective distortion itself (via the focal length implied by the two
 * vanishing points) and measured 0.0% error — but it degenerates exactly when
 * the quad is a parallelogram, which is the near-flat-on case where edge
 * averaging is accurate to 0.2%. The two cover each other.
 *
 * Quad is TL, TR, BR, BL in pixels; principal point is assumed at the image
 * centre, which for phone photos it is.
 */
export function recoverAspect(
  quad: Point[],
  imageW: number,
  imageH: number,
  /**
   * Focal length in pixels, if the camera told us (EXIF). Without it, the
   * single-axis-tilt case — a phone held square to the object but pitched
   * down, i.e. the most common photo in this archive — is genuinely ambiguous:
   * one vanishing point sits at infinity, Zhang's f² estimate degenerates, and
   * no geometry can separate focal length from tilt. With it, the metric ratio
   * is recoverable in every non-parallelogram case.
   */
  focalPx?: number,
): number {
  const [tl, tr, br, bl] = quad as [Point, Point, Point, Point]

  const edgeAverage =
    (dist(tl, tr) + dist(bl, br)) / 2 / Math.max(1e-6, (dist(tl, bl) + dist(tr, br)) / 2)

  // Homogeneous coordinates about the principal point.
  const cx = imageW / 2
  const cy = imageH / 2
  const m1 = [tl.x - cx, tl.y - cy, 1]
  const m2 = [tr.x - cx, tr.y - cy, 1]
  const m3 = [bl.x - cx, bl.y - cy, 1]
  const m4 = [br.x - cx, br.y - cy, 1]

  // Zhang & He, "Whiteboard scanning and image enhancement", §3.2.
  const k2 = det3(m1, m4, m3) / det3(m2, m4, m3)
  const k3 = det3(m1, m4, m2) / det3(m3, m4, m2)
  const n2 = [k2 * m2[0]! - m1[0]!, k2 * m2[1]! - m1[1]!, k2 - 1]
  const n3 = [k3 * m3[0]! - m1[0]!, k3 * m3[1]! - m1[1]!, k3 - 1]

  const k2Degenerate = Math.abs(k2 - 1) < 1e-4
  const k3Degenerate = Math.abs(k3 - 1) < 1e-4

  // Both k → 1: a true parallelogram, no perspective information at all.
  // Edge averaging is accurate exactly here.
  if (k2Degenerate && k3Degenerate) return edgeAverage

  // The ratio formula (Zhang & He eq. 20) is valid for any n once f is known:
  // ratio² = (n2ᵀ K⁻ᵀK⁻¹ n2) / (n3ᵀ K⁻ᵀK⁻¹ n3), K = diag(f, f, 1).
  const ratioWith = (f2: number) => {
    const num = (n2[0]! * n2[0]! + n2[1]! * n2[1]!) / f2 + n2[2]! * n2[2]!
    const den = (n3[0]! * n3[0]! + n3[1]! * n3[1]!) / f2 + n3[2]! * n3[2]!
    const r2 = num / den
    return Number.isFinite(r2) && r2 > 0 ? Math.sqrt(r2) : edgeAverage
  }

  // One k → 1: one vanishing point at infinity. f cannot be estimated from the
  // quad — only the camera knows it.
  if (k2Degenerate || k3Degenerate) {
    return focalPx && focalPx > 0 ? ratioWith(focalPx * focalPx) : edgeAverage
  }

  // Both vanishing points finite: prefer the camera's own f, else estimate it
  // from the orthogonality of the two directions.
  if (focalPx && focalPx > 0) return ratioWith(focalPx * focalPx)
  const f2 = -(n2[0]! * n3[0]! + n2[1]! * n3[1]!) / (n2[2]! * n3[2]!)
  if (!Number.isFinite(f2) || f2 <= 0) return edgeAverage
  return ratioWith(f2)
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function det3(a: number[], b: number[], c: number[]) {
  return (
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
    a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
    a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)
  )
}

/**
 * Solves the homography mapping the OUTPUT unit rectangle to the source quad,
 * i.e. the inverse map, which is what the sampler needs: for each destination
 * pixel, where in the source do I read?
 */
export function solveHomography(quad: Point[], outW: number, outH: number): Homography {
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]
  // 8×8 linear system Ah = b for h = [a,b,c,d,e,f,g,h], with i = 1.
  const A: number[][] = []
  const rhs: number[] = []
  for (let i = 0; i < 4; i++) {
    const s = src[i]!
    const d = quad[i]!
    A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x])
    rhs.push(d.x)
    A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y])
    rhs.push(d.y)
  }
  const h = gauss(A, rhs)
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1]
}

/** Gaussian elimination with partial pivoting; 8×8, runs once per derive. */
function gauss(A: number[][], b: number[]): number[] {
  const n = A.length
  const m = A.map((row, i) => [...row, b[i]!])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row
    }
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    const div = m[col]![col]!
    if (Math.abs(div) < 1e-12) throw new Error('degenerate homography')
    for (let k = col; k <= n; k++) m[col]![k]! /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row]![col]!
      for (let k = col; k <= n; k++) m[row]![k]! -= factor * m[col]![k]!
    }
  }
  return m.map((row) => row[n]!)
}

/**
 * Bilinear inverse warp: for every output pixel, apply the homography, sample
 * the source with bilinear interpolation. Output-sized cost, input-agnostic.
 */
export function warpPerspective(
  src: Buffer,
  srcW: number,
  srcH: number,
  channels: number,
  quad: Point[],
  outW: number,
  outH: number,
): Buffer {
  const H = solveHomography(quad, outW, outH)
  const out = Buffer.allocUnsafe(outW * outH * channels)

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = H[6] * x + H[7] * y + 1
      const sx = (H[0] * x + H[1] * y + H[2]) / w
      const sy = (H[3] * x + H[4] * y + H[5]) / w

      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const o = (y * outW + x) * channels

      if (x0 < 0 || y0 < 0 || x0 + 1 >= srcW || y0 + 1 >= srcH) {
        // Outside the photograph: white, the sticker-paper ground every
        // surface already puts behind a cutout.
        for (let c = 0; c < channels; c++) out[o + c] = 255
        continue
      }

      const i00 = (y0 * srcW + x0) * channels
      const i10 = i00 + channels
      const i01 = i00 + srcW * channels
      const i11 = i01 + channels
      for (let c = 0; c < channels; c++) {
        const top = src[i00 + c]! * (1 - fx) + src[i10 + c]! * fx
        const bottom = src[i01 + c]! * (1 - fx) + src[i11 + c]! * fx
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }
  return out
}
