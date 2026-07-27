import type { Silhouette } from './silhouettes'

/**
 * How wide a cutout should render in a timeline run.
 *
 * The doc's rows look hand-placed because the objects are genuinely different
 * sizes — a boarding pass is 172px next to an 86px enamel pin. That variety has
 * to come from the object's own proportions, not from decoration, so this reads
 * the face's aspect ratio and the silhouette rather than randomising.
 */
export function cutoutWidth(
  silhouette: Silhouette,
  aspect: number,
  { min = 84, max = 180 }: { min?: number; max?: number } = {},
) {
  // Round things are small and dense; a 176px coin would read as a plate.
  if (silhouette === 'circle') return clamp(72, 96, Math.round(78 * aspect))
  if (silhouette === 'bust') return clamp(84, 112, Math.round(92 * aspect))
  if (silhouette === 'polaroid') return clamp(108, 148, Math.round(120 / Math.max(aspect, 0.6)))

  // Everything else scales with how wide the face actually is.
  return clamp(min, max, Math.round(96 + 46 * (aspect - 0.9)))
}

/** Face aspect from stored pixel dimensions, with a sane default. */
export function aspectOf(width?: number | null, height?: number | null) {
  if (!width || !height) return 1.15
  return width / height
}

function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value))
}
