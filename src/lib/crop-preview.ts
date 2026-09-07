import { isSaneCrop, orderCorners, recoverAspect, solveHomography, type CropPoint } from './crop-geometry'

const MAX_EDGE = 1600

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function drawCropPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, points: CropPoint[] | null) {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) return

  const scale = Math.min(1, 1200 / Math.max(width, height))
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) return

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if (!points) return

  context.save()
  context.fillStyle = 'rgb(20 18 15 / .48)'
  context.beginPath()
  context.rect(0, 0, canvas.width, canvas.height)
  points.forEach((point, index) => {
    if (index) context.lineTo(point.x * canvas.width, point.y * canvas.height)
    else context.moveTo(point.x * canvas.width, point.y * canvas.height)
  })
  context.closePath()
  context.fill('evenodd')
  context.strokeStyle = 'white'
  context.lineWidth = 2
  context.stroke()
  context.restore()
}

function outputSize(quad: CropPoint[], width: number, height: number, focal35?: number) {
  let area = 0
  for (let index = 0; index < 4; index++) {
    const a = quad[index]!
    const b = quad[(index + 1) % 4]!
    area += a.x * b.y - b.x * a.y
  }
  area = Math.abs(area / 2)
  const aspect = recoverAspect(quad, width, height, focal35 ? focal35 * Math.hypot(width, height) / 43.266615 : undefined)
  const scale = Math.min(1, MAX_EDGE / Math.sqrt(area * Math.max(aspect, 1 / aspect)))
  return {
    width: Math.max(64, Math.round(Math.sqrt(area * aspect) * scale)),
    height: Math.max(64, Math.round(Math.sqrt(area / aspect) * scale)),
  }
}

export async function cropPreview(image: HTMLImageElement, corners: CropPoint[] | null, focal35?: number): Promise<Blob> {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('The photograph is not ready yet.')

  if (!corners) {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    const full = makeCanvas(Math.round(width * scale), Math.round(height * scale))
    full.getContext('2d')?.drawImage(image, 0, 0, full.width, full.height)
    const blob = await canvasBlob(full)
    if (!blob) throw new Error('Could not make the corrected preview.')
    return blob
  }

  if (!isSaneCrop(corners)) throw new Error('Move the corners so they outline a real four-sided shape.')
  const originalQuad = orderCorners(corners.map((corner) => ({ x: corner.x * width, y: corner.y * height })))
  const size = outputSize(originalQuad, width, height, focal35)
  const sourceScale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const source = makeCanvas(Math.max(1, Math.round(width * sourceScale)), Math.max(1, Math.round(height * sourceScale)))
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Could not read this photograph.')
  sourceContext.drawImage(image, 0, 0, source.width, source.height)

  const quad = originalQuad.map((point) => ({ x: point.x * source.width / width, y: point.y * source.height / height }))
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data
  const output = new ImageData(size.width, size.height)
  const homography = solveHomography(quad, size.width, size.height)

  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const w = homography[6] * x + homography[7] * y + 1
      const sourceX = (homography[0] * x + homography[1] * y + homography[2]) / w
      const sourceY = (homography[3] * x + homography[4] * y + homography[5]) / w
      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const fx = sourceX - x0
      const fy = sourceY - y0
      const offset = (y * size.width + x) * 4

      if (x0 < 0 || y0 < 0 || x0 + 1 >= source.width || y0 + 1 >= source.height) {
        output.data.set([255, 255, 255, 255], offset)
        continue
      }

      const i00 = (y0 * source.width + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + source.width * 4
      const i11 = i01 + 4
      for (let channel = 0; channel < 4; channel++) {
        const top = pixels[i00 + channel]! * (1 - fx) + pixels[i10 + channel]! * fx
        const bottom = pixels[i01 + channel]! * (1 - fx) + pixels[i11 + channel]! * fx
        output.data[offset + channel] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }

  const preview = makeCanvas(size.width, size.height)
  preview.getContext('2d')?.putImageData(output, 0, 0)
  const blob = await canvasBlob(preview)
  if (!blob) throw new Error('Could not make the corrected preview.')
  return blob
}
