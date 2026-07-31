/**
 * Proof for the perspective warp — pure geometry, no database, no Blob.
 *
 *   npm run db:verify:warp
 *
 * Ground truth is synthetic: render a known rectangle under a known homography
 * with sharp, hand the warp the projected corners, and assert it recovers what
 * was there before the camera skewed it. No fixture images, no eyeballing.
 */
import sharp from 'sharp'

import {
  isSaneQuad,
  orderCorners,
  recoverAspect,
  solveHomography,
  warpPerspective,
  type Point,
} from '../src/server/warp'
import { check, failures } from './verify-db'

async function main() {
  console.log('\nGeometry')

  /* ---- corner ordering ---------------------------------------------------- */
  const shuffled: Point[] = [
    { x: 9, y: 8 }, // BR
    { x: 1, y: 0.5 }, // TL
    { x: 0.5, y: 9 }, // BL
    { x: 10, y: 1 }, // TR
  ]
  const ordered = orderCorners(shuffled)
  check(
    'orderCorners sorts any input TL,TR,BR,BL',
    ordered[0]!.x === 1 && ordered[1]!.x === 10 && ordered[2]!.x === 9 && ordered[3]!.x === 0.5,
    ordered.map((c) => `(${c.x},${c.y})`).join(' '),
  )

  /* ---- quad sanity -------------------------------------------------------- */
  const square: Point[] = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ]
  check('a square is sane', isSaneQuad(square))
  const bowtie: Point[] = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.9 },
  ]
  check('a bowtie is rejected', !isSaneQuad(bowtie))
  const sliver: Point[] = [
    { x: 0.1, y: 0.5 },
    { x: 0.9, y: 0.5 },
    { x: 0.9, y: 0.502 },
    { x: 0.1, y: 0.502 },
  ]
  check('a sliver is rejected', !isSaneQuad(sliver))

  /* ---- homography round-trip ---------------------------------------------- */
  const quad: Point[] = [
    { x: 120, y: 80 },
    { x: 900, y: 140 },
    { x: 860, y: 700 },
    { x: 90, y: 660 },
  ]
  const H = solveHomography(quad, 400, 300)
  const map = (x: number, y: number) => {
    const w = H[6] * x + H[7] * y + 1
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w }
  }
  const rt = [map(0, 0), map(400, 0), map(400, 300), map(0, 300)]
  const maxErr = Math.max(...rt.map((p, i) => Math.hypot(p.x - quad[i]!.x, p.y - quad[i]!.y)))
  check('homography maps output corners onto the quad', maxErr < 1e-6, `max err ${maxErr.toExponential(2)}`)

  /* ---- aspect recovery, the trap the research measured --------------------- */
  // Project a 2:1 rectangle through a plausible camera (f=1000px, tilted) and
  // ask for its aspect back. Edge-averaging is measurably wrong here; Zhang
  // must not be.
  const f = 1000
  // Project a 2:1 rectangle through a known camera. `project` rotates the
  // object plane about the x-axis by `tilt`, then optionally about the y-axis
  // by `yaw`, then perspective-projects with focal f at Z = 2f.
  const project = (X: number, Y: number, tilt: number, yaw: number): Point => {
    const Y1 = Y * Math.cos(tilt)
    const Z1 = Y * Math.sin(tilt)
    const X2 = X * Math.cos(yaw) + Z1 * Math.sin(yaw)
    const Z2 = -X * Math.sin(yaw) + Z1 * Math.cos(yaw) + 2 * f
    return { x: (X2 / Z2) * f + 640, y: (Y1 / Z2) * f + 480 }
  }
  const W = 800
  const Hh = 400 // true aspect 2.0
  const quadFor = (tilt: number, yaw: number) => [
    project(-W / 2, -Hh / 2, tilt, yaw),
    project(W / 2, -Hh / 2, tilt, yaw),
    project(W / 2, Hh / 2, tilt, yaw),
    project(-W / 2, Hh / 2, tilt, yaw),
  ]
  const edgeAvgOf = (q: Point[]) =>
    (Math.hypot(q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y) +
      Math.hypot(q[2]!.x - q[3]!.x, q[2]!.y - q[3]!.y)) /
    2 /
    ((Math.hypot(q[3]!.x - q[0]!.x, q[3]!.y - q[0]!.y) +
      Math.hypot(q[2]!.x - q[1]!.x, q[2]!.y - q[1]!.y)) /
      2)

  // General pose: both vanishing points finite, Zhang self-recovers f.
  const general = quadFor(0.5, 0.3)
  const recoveredGeneral = recoverAspect(general, 1280, 960)
  check(
    'general tilt: aspect recovered with no focal length given',
    Math.abs(recoveredGeneral - 2) < 0.02,
    `zhang ${recoveredGeneral.toFixed(4)}, edge-average ${edgeAvgOf(general).toFixed(4)}`,
  )

  // Single-axis tilt — the phone-pitched-down shot, the most common in this
  // archive. One vanishing point at infinity: without f the geometry is
  // genuinely ambiguous, with the camera's f it is exact.
  const pitched = quadFor(0.5, 0)
  const blind = recoverAspect(pitched, 1280, 960)
  const informed = recoverAspect(pitched, 1280, 960, f)
  check(
    'single-axis tilt without focal falls back to edge-average (ambiguous)',
    Math.abs(blind - edgeAvgOf(pitched)) < 1e-9,
    `fell back to ${blind.toFixed(4)}`,
  )
  check(
    'single-axis tilt with the EXIF focal recovers the true 2:1',
    Math.abs(informed - 2) < 0.02,
    `${informed.toFixed(4)} (edge-average would say ${edgeAvgOf(pitched).toFixed(4)}, ${((edgeAvgOf(pitched) / 2 - 1) * 100).toFixed(1)}% off)`,
  )

  // Flat-on parallelogram: zhang degenerates, edge-average takes over.
  const flat: Point[] = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 300 },
    { x: 100, y: 300 },
  ]
  const flatAspect = recoverAspect(flat, 640, 480)
  check('flat-on falls back to edge lengths', Math.abs(flatAspect - 2) < 1e-6, flatAspect.toFixed(4))

  /* ---- the pixels themselves ---------------------------------------------- */
  console.log('\nPixels')
  // Render a white canvas with a black rectangle drawn INSIDE a known
  // projected quad, warp it back, and assert the output is black wall-to-wall —
  // which the old bounding-box crop could never produce for a skewed quad.
  const srcW = 1200
  const srcH = 900
  const skewQuad: Point[] = [
    { x: 200, y: 150 },
    { x: 1000, y: 260 },
    { x: 940, y: 760 },
    { x: 160, y: 640 },
  ]
  const svgPoints = skewQuad.map((p) => `${p.x},${p.y}`).join(' ')
  const png = await sharp(
    Buffer.from(
      `<svg width="${srcW}" height="${srcH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${srcW}" height="${srcH}" fill="#ffffff"/>
        <polygon points="${svgPoints}" fill="#000000"/>
      </svg>`,
    ),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = warpPerspective(png.data, png.info.width, png.info.height, 3, skewQuad, 320, 240)
  let dark = 0
  const total = 320 * 240
  for (let i = 0; i < total; i++) if (out[i * 3]! < 40) dark++
  check(
    'warping the quad yields the object full-bleed',
    dark / total > 0.97,
    `${((dark / total) * 100).toFixed(1)}% of output is the object (bbox crop: ~55%)`,
  )

  // The same scene through the old bounding-box math, for the record.
  const xs = skewQuad.map((c) => c.x)
  const ys = skewQuad.map((c) => c.y)
  const bboxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  let quadArea = 0
  for (let i = 0; i < 4; i++) {
    const a = skewQuad[i]!
    const b = skewQuad[(i + 1) % 4]!
    quadArea += a.x * b.y - b.x * a.y
  }
  quadArea = Math.abs(quadArea / 2)
  check(
    'the old crop would have kept background in frame',
    quadArea / bboxArea < 0.9,
    `object filled only ${((quadArea / bboxArea) * 100).toFixed(0)}% of the old crop`,
  )

  console.log(failures() ? `\n${failures()} FAILED\n` : '\nall checks passed\n')
}

main().then(
  () => process.exit(failures() ? 1 : 0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
