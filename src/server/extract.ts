import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { OBJECT_KINDS } from './db/schema'
import type { IntakeSuggestions } from './intake'

export function hasExtraction() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

const TOOL = {
  name: 'record_object',
  description: 'Record what can be read off the face of a keepsake.',
  input_schema: {
    type: 'object' as const,
    properties: {
      kind: {
        type: 'string',
        enum: [...OBJECT_KINDS],
        description: 'What sort of object this is.',
      },
      title: {
        type: 'string',
        description:
          'A short, plain name for the object as a person would say it, e.g. "Ticket stub, The Fillmore". Never invent a person.',
      },
      place: { type: 'string', description: 'Place named on the object, if any.' },
      date: { type: 'string', description: 'ISO date (YYYY-MM-DD) printed on the object, if any.' },
      occasion: { type: 'string', description: 'The occasion, if the object names one.' },
      confidence: {
        type: 'object',
        description: 'Per-field confidence from 0 to 1.',
        properties: {
          kind: { type: 'number' },
          title: { type: 'number' },
          place: { type: 'number' },
          date: { type: 'number' },
          occasion: { type: 'number' },
        },
      },
    },
    required: ['kind', 'title', 'confidence'],
  },
}

type ToolInput = {
  kind?: string
  title?: string
  place?: string
  date?: string
  occasion?: string
  confidence?: Record<string, number>
}

/**
 * Reads what is printed on the object.
 *
 * Note what is *not* here: who gave it to you. No model can know that, and the
 * design deliberately leaves FROM empty with "Who gave it to you?" rather than
 * guessing. Confidence is per-field because the UI renders it — "PLACE  The
 * Fillmore, SF  91%" is the actual design.
 */
export async function extractFromImage(
  imageUrl: string,
  hints?: { exifDate?: string | null },
): Promise<IntakeSuggestions | null> {
  if (!hasExtraction()) return null

  const client = new Anthropic()

  const image = await fetch(imageUrl, { cache: 'no-store' })
  if (!image.ok) throw new Error(`could not read the cutout (${image.status})`)
  // bytes() rather than arrayBuffer() — see derive.ts; the same
  // SharedArrayBuffer rejection applies here.
  const bytes = Buffer.from(await image.bytes()).toString('base64')
  const mediaType = (image.headers.get('content-type') ?? 'image/webp') as
    | 'image/webp'
    | 'image/jpeg'
    | 'image/png'

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: bytes } },
          {
            type: 'text',
            text: [
              'This is a photograph of a physical keepsake someone is filing in a personal archive.',
              'Record only what is legible on the object itself. Leave a field out rather than guessing;',
              'a low confidence is more useful than an invention.',
              hints?.exifDate
                ? `The photograph was taken on ${hints.exifDate}, which is when it was photographed, not necessarily its date.`
                : '',
            ]
              .filter(Boolean)
              .join(' '),
          },
        ],
      },
    ],
  })

  const use = message.content.find((block) => block.type === 'tool_use')
  if (!use || use.type !== 'tool_use') return null
  const input = use.input as ToolInput
  const confidence = input.confidence ?? {}

  const field = (key: keyof IntakeSuggestions, value?: string) =>
    value ? { value, confidence: Math.max(0, Math.min(1, confidence[key] ?? 0.5)) } : undefined

  const suggestions: IntakeSuggestions = {}
  const kind = field('kind', input.kind)
  const title = field('title', input.title)
  const place = field('place', input.place)
  // EXIF beats the model on dates: it is ground truth about the capture, and a
  // date printed on a ticket is often the same day anyway.
  const date = field('date', input.date ?? hints?.exifDate ?? undefined)
  const occasion = field('occasion', input.occasion)

  if (kind) suggestions.kind = kind
  if (title) suggestions.title = title
  if (place) suggestions.place = place
  if (date) suggestions.date = date
  if (occasion) suggestions.occasion = occasion

  return suggestions
}
