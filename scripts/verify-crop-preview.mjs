import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const outdir = mkdtempSync(`${tmpdir()}/capsule-crop-preview-`)
buildSync({ entryPoints: ['src/lib/crop-preview.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${outdir}/crop.mjs` })
const canvases = []
globalThis.ImageData = class { constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4) } }
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas')
    const canvas = { width: 0, height: 0, pixels: null,
      getContext() { return {
        drawImage() { assert.ok(canvas.width <= 1600 && canvas.height <= 1600, 'large originals must never allocate full-resolution preview canvases') },
        getImageData() {
          const pixels = new ImageData(canvas.width, canvas.height)
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) pixels.data.set([Math.round(x / canvas.width * 255), Math.round(y / canvas.height * 255), 0, 255], (y * canvas.width + x) * 4)
          return pixels
        },
        putImageData(pixels) { canvas.pixels = pixels },
      } },
      toBlob(callback, type) {
        const center = canvas.pixels?.data.slice((Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4).slice(0, 4)
        callback(new Blob([JSON.stringify({ width: canvas.width, height: canvas.height, first: Array.from(canvas.pixels?.data.slice(0, 4) ?? []), center: Array.from(center ?? []) })], { type }))
      },
    }
    canvases.push(canvas)
    return canvas
  },
}
try {
  const { cropPreview } = await import(`${outdir}/crop.mjs`)
  const image = { naturalWidth: 8000, naturalHeight: 6000 }
  const full = await cropPreview(image, null)
  assert.equal(full.type, 'image/jpeg')
  assert.deepEqual(JSON.parse(await full.text()), { width: 1600, height: 1200, first: [], center: [] })
  const crop = await cropPreview(image, [{ x: .25, y: .25 }, { x: .75, y: .25 }, { x: .75, y: .75 }, { x: .25, y: .75 }])
  const result = JSON.parse(await crop.text())
  assert.equal(result.width, 1600); assert.equal(result.height, 1200)
  assert.deepEqual(result.first, [64, 64, 0, 255])
  assert.deepEqual(result.center, [128, 128, 0, 255])
  const smallCrop = [{ x: .1, y: .1 }, { x: .21, y: .1 }, { x: .21, y: .21 }, { x: .1, y: .21 }]
  await cropPreview(image, smallCrop)
  assert.ok(canvases.every((canvas) => canvas.width <= 1600 && canvas.height <= 1600))
  for (const corners of [
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: .5, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  ]) await assert.rejects(cropPreview(image, corners), /four-sided shape/)
  console.log('verify-crop-preview: passed (corrected pixels, invalid corners, 48MP source memory bound, JPEG export)')
} finally { rmSync(outdir, { recursive: true, force: true }) }
