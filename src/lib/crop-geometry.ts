export type CropPoint = { x: number; y: number }
export type Point = CropPoint
export type Homography = [number, number, number, number, number, number, number, number, number]

export const FULL_CROP: CropPoint[] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
]

export function clampPoint(point: CropPoint): CropPoint {
  return { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) }
}

export function orderCorners(corners: Point[]): Point[] {
  const cx = corners.reduce((sum, c) => sum + c.x, 0) / corners.length
  const cy = corners.reduce((sum, c) => sum + c.y, 0) / corners.length
  const byAngle = [...corners].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let lead = 0
  for (let i = 1; i < 4; i++) if (byAngle[i]!.x + byAngle[i]!.y < byAngle[lead]!.x + byAngle[lead]!.y) lead = i
  return [0, 1, 2, 3].map((i) => byAngle[(lead + i) % 4]!)
}

export function isSaneQuad(quad: Point[], minArea = 0.01): boolean {
  if (quad.length !== 4 || quad.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false
  let area = 0
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!
    const b = quad[(i + 1) % 4]!
    const c = quad[(i + 2) % 4]!
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) return false
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-10) return false
    const next = Math.sign(cross)
    if (!sign) sign = next
    else if (sign !== next) return false
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area / 2) >= minArea
}

export function isSaneCrop(points: CropPoint[]) {
  return points.length === 4
    && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
    && isSaneQuad(points)
}
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const det3 = (a: number[], b: number[], c: number[]) => a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)

export function recoverAspect(quad: Point[], imageW: number, imageH: number, focalPx?: number): number {
  const [tl, tr, br, bl] = quad as [Point, Point, Point, Point]
  const edgeAverage = (dist(tl, tr) + dist(bl, br)) / 2 / Math.max(1e-6, (dist(tl, bl) + dist(tr, br)) / 2)
  const cx = imageW / 2, cy = imageH / 2
  const m1 = [tl.x - cx, tl.y - cy, 1], m2 = [tr.x - cx, tr.y - cy, 1], m3 = [bl.x - cx, bl.y - cy, 1], m4 = [br.x - cx, br.y - cy, 1]
  const k2 = det3(m1, m4, m3) / det3(m2, m4, m3), k3 = det3(m1, m4, m2) / det3(m3, m4, m2)
  const n2 = [k2 * m2[0]! - m1[0]!, k2 * m2[1]! - m1[1]!, k2 - 1], n3 = [k3 * m3[0]! - m1[0]!, k3 * m3[1]! - m1[1]!, k3 - 1]
  const k2Degenerate = Math.abs(k2 - 1) < 1e-4, k3Degenerate = Math.abs(k3 - 1) < 1e-4
  if (k2Degenerate && k3Degenerate) return edgeAverage
  const ratioWith = (f2: number) => { const ratio = ((n2[0]! ** 2 + n2[1]! ** 2) / f2 + n2[2]! ** 2) / ((n3[0]! ** 2 + n3[1]! ** 2) / f2 + n3[2]! ** 2); return Number.isFinite(ratio) && ratio > 0 ? Math.sqrt(ratio) : edgeAverage }
  if (k2Degenerate || k3Degenerate) return focalPx && focalPx > 0 ? ratioWith(focalPx ** 2) : edgeAverage
  if (focalPx && focalPx > 0) return ratioWith(focalPx ** 2)
  const f2 = -(n2[0]! * n3[0]! + n2[1]! * n3[1]!) / (n2[2]! * n3[2]!)
  return Number.isFinite(f2) && f2 > 0 ? ratioWith(f2) : edgeAverage
}

export function solveHomography(quad: Point[], outW: number, outH: number): Homography {
  const source = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], A: number[][] = [], rhs: number[] = []
  for (let i = 0; i < 4; i++) { const s = source[i]!, d = quad[i]!; A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]); rhs.push(d.x); A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]); rhs.push(d.y) }
  const matrix = A.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < 8; col++) { let pivot = col; for (let row = col + 1; row < 8; row++) if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!)) pivot = row; [matrix[col], matrix[pivot]] = [matrix[pivot]!, matrix[col]!]; const divisor = matrix[col]![col]!; if (Math.abs(divisor) < 1e-12) throw new Error('degenerate homography'); for (let k = col; k <= 8; k++) matrix[col]![k]! /= divisor; for (let row = 0; row < 8; row++) { if (row === col) continue; const factor = matrix[row]![col]!; for (let k = col; k <= 8; k++) matrix[row]![k]! -= factor * matrix[col]![k]! } }
  const h = matrix.map((row) => row[8]!)
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1]
}
