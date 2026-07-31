/// <reference lib="webworker" />
/**
 * Edge detection for the corner editor, off the main thread.
 *
 * Compiled to public/detect-worker.js by esbuild (npm run build:detect),
 * exactly like the service worker — which is the point. A worker built outside
 * Turbopack cannot be imported by a route, so it is structurally impossible for
 * this to end up in the Ledger bundle. The plan's risk #2 ("OpenCV must never
 * touch the Ledger bundle") stops being a bundle-analysis problem that needs a
 * CI check and becomes a property of the build.
 *
 * scanic rather than OpenCV.js: 99 KB total against 13.3 MB, and OpenCV ships a
 * SINGLE_FILE emscripten build with the wasm inlined as a JS string literal, so
 * it cannot even be split out of the bundle.
 *
 * `detector: 'classical'` only. The optional ML detector lazily fetches an ONNX
 * runtime and model from a CDN, which would add a third-party origin to a
 * private archive and break the offline story.
 */
import { scanDocument } from 'scanic'

export type DetectRequest = {
  id: number
  image: ImageData
}

export type DetectResponse = {
  id: number
  /** Normalised 0–1, [TL, TR, BR, BL] — the order the app stores. */
  corners: { x: number; y: number }[] | null
  confidence: number | null
  ms: number
}

/**
 * Below this, the detector's answer is discarded.
 *
 * It does not simply fail on a hard image — it returns a confidently-shaped
 * quad that happens to be wrong. Measured on a low-contrast scene (pale object
 * on a pale ground): corners 498px out on a 1200px frame, at confidence 0.208.
 * The same scene with real contrast scored 0.876 and landed within 5px. Moving
 * someone's corners to the wrong place is worse than leaving the default box
 * alone, and the manual drag is the primary path by design — so anything this
 * unsure is treated as "no document found".
 */
const MIN_CONFIDENCE = 0.55

declare const self: DedicatedWorkerGlobalScope

self.addEventListener('message', (event: MessageEvent<DetectRequest>) => {
  const { id, image } = event.data
  const started = performance.now()

  void scanDocument(image, {
    mode: 'detect',
    detector: 'classical',
    // The detector runs on a downscale of whatever it is handed; 600 was enough
    // for single-digit-pixel corner error in testing and keeps the pass fast.
    maxProcessingDimension: 600,
  })
    .then((result) => {
      const c = result.corners
      const sure = (result.confidence ?? 0) >= MIN_CONFIDENCE
      const reply: DetectResponse = {
        id,
        corners:
          result.success && c && sure
            ? // Normalised against the SAME dimensions the caller drew, so the
              // app's 0–1 corners land correctly whatever the source size.
              [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft].map((p) => ({
                x: Math.min(1, Math.max(0, p.x / image.width)),
                y: Math.min(1, Math.max(0, p.y / image.height)),
              }))
            : null,
        confidence: result.confidence ?? null,
        ms: performance.now() - started,
      }
      self.postMessage(reply)
    })
    .catch(() => {
      // Detection is a convenience over a manual path that already works —
      // never a reason to fail the cut.
      self.postMessage({ id, corners: null, confidence: null, ms: performance.now() - started })
    })
})
