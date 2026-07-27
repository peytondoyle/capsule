'use client'

import { useState } from 'react'

import { Cutout, aspectOf, cutoutWidth, type CutStyle, type Silhouette } from '@/design'

type Face = {
  id: string
  role: 'recto' | 'verso' | 'detail'
  cutoutUrl: string | null
  width: number | null
  height: number | null
}

const ROLE_LABEL: Record<Face['role'], string> = {
  recto: 'tilt to catch the light',
  verso: 'the back',
  detail: 'closer',
}

/**
 * The hero, with the doc's three page dots.
 *
 * "recto · verso →" is a real affordance, not decoration: half the reason to
 * photograph a boarding pass is the gate number someone wrote on the back.
 */
export function Faces({
  faces,
  silhouette,
  cut,
  rotate,
  title,
  kind,
}: {
  faces: Face[]
  silhouette: Silhouette
  cut: CutStyle
  rotate: number
  title: string
  kind: string | null
}) {
  const [index, setIndex] = useState(0)
  const face = faces[index] ?? faces[0]
  if (!face) return null

  const aspect = aspectOf(face.width, face.height)

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex w-full justify-center px-6 pt-8 pb-6"
        style={{ background: 'linear-gradient(var(--bg), var(--panel))' }}
      >
        <Cutout
          key={face.id}
          width={cutoutWidth(silhouette, aspect, { min: 180, max: 250 })}
          silhouette={silhouette}
          cut={cut}
          rotate={rotate}
          aspect={aspect}
          src={face.cutoutUrl ?? undefined}
          alt={title}
          label={face.cutoutUrl ? undefined : (ROLE_LABEL[face.role] ?? kind ?? undefined)}
          interactive
        />
      </div>

      {faces.length > 1 ? (
        <div className="flex gap-[5px] pb-1" role="tablist" aria-label="Faces">
          {faces.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={f.role}
              onClick={() => setIndex(i)}
              className="size-[5px] rounded-full transition-colors"
              style={{
                background: i === index ? 'var(--accent)' : 'color-mix(in srgb, var(--ink) 22%, transparent)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
