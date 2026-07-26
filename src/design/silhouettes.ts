/**
 * The cut-out vocabulary, lifted from Capsule.dc.html.
 *
 * Two orthogonal axes, both stored per object:
 *   silhouette — the outline of the thing (a ticket has notches, a pin is round)
 *   cut style  — how it was trimmed (flush, thick white border, organic, uncut)
 *
 * Silhouettes are expressed as border-radius where they can be, because
 * border-radius antialiases better than clip-path and does not clip shadows.
 * `ticket` genuinely needs clip-path — no radius makes side notches.
 */

export type Silhouette =
  | 'edge'
  | 'card'
  | 'ticket'
  | 'polaroid'
  | 'circle'
  | 'blob'
  | 'bust'

export type CutStyle = 'edge' | 'die_cut' | 'loose' | 'full'

type SilhouetteSpec = {
  radius?: string
  clipPath?: string
  /** Extra white below the image — the polaroid chin. */
  chin?: number
  /** Force a 1:1 box regardless of the face's aspect ratio. */
  square?: boolean
  label: string
}

export const SILHOUETTES: Record<Silhouette, SilhouetteSpec> = {
  edge: { radius: '2px', label: 'Edge' },
  card: { radius: '3px', label: 'Card' },
  ticket: {
    clipPath:
      'polygon(0 0,100% 0,100% 36%,95% 50%,100% 64%,100% 100%,0 100%,0 64%,5% 50%,0 36%)',
    label: 'Ticket',
  },
  polaroid: { radius: '2px', chin: 26, label: 'Polaroid' },
  circle: { radius: '50%', square: true, label: 'Circle' },
  blob: { radius: '50% 42% 55% 45% / 48% 58% 42% 52%', label: 'Blob' },
  bust: { radius: '46% 46% 32% 32% / 34% 34% 12% 12%', label: 'Bust' },
}

type CutSpec = {
  /** White sticker edge, in px. */
  pad: number
  /** FULL is the honest escape hatch: uncut, dashed outline, silhouette ignored. */
  uncut?: boolean
  label: string
}

export const CUT_STYLES: Record<CutStyle, CutSpec> = {
  edge: { pad: 5, label: 'Edge' },
  die_cut: { pad: 9, label: 'Die-cut' },
  loose: { pad: 4, label: 'Loose' },
  full: { pad: 6, uncut: true, label: 'Full' },
}

export const SILHOUETTE_KEYS = Object.keys(SILHOUETTES) as Silhouette[]
export const CUT_STYLE_KEYS = Object.keys(CUT_STYLES) as CutStyle[]

/** The hatch that stands in for a cutout that has not been generated yet. */
export const HATCH =
  'repeating-linear-gradient(128deg, var(--fill-a) 0 5px, var(--fill-b) 5px 10px)'

/**
 * Picks a sensible silhouette for an object kind. Intake uses this as the
 * default before anyone touches the CUT STYLE picker.
 */
export function silhouetteForKind(kind: string | null | undefined): Silhouette {
  switch (kind) {
    case 'ticket_stub':
      return 'ticket'
    case 'polaroid':
      return 'polaroid'
    case 'pin':
    case 'coin':
      return 'circle'
    case 'pressed_plant':
    case 'fabric':
      return 'blob'
    case 'figurine':
      return 'bust'
    case 'note':
    case 'letter':
    case 'key':
      return 'edge'
    default:
      return 'card'
  }
}
