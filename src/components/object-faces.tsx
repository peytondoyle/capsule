'use client'

import { useState } from 'react'

import { Cutout } from '@/design/cutout'
import { aspectOf, cutoutWidth } from '@/design/sizing'
import type { CutStyle, Silhouette } from '@/design/silhouettes'

export type ObjectFace = {
  id: string
  role: 'recto' | 'verso' | 'detail'
  cutoutUrl: string | null
  thumbUrl?: string | null
  width: number | null
  height: number | null
}

const labels = { recto: 'Front', verso: 'Back', detail: 'Detail' }

export function ObjectFaces({ faces, silhouette, cut, rotate, title, kind, width = 220 }: {
  faces: ObjectFace[]
  silhouette: Silhouette
  cut: CutStyle
  rotate: number
  title: string
  kind?: string | null
  width?: number
}) {
  const ordered = (['recto', 'verso', 'detail'] as const).flatMap((role) => faces.filter((face) => face.role === role))
  const [selectedId, setSelectedId] = useState<string>()
  const selected = ordered.find((face) => face.id === selectedId) ?? ordered[0]
  if (!selected) return null

  const front = ordered.find((face) => face.role === 'recto')
  const back = ordered.find((face) => face.role === 'verso')
  const turning = front && back && (selected.id === front.id || selected.id === back.id)
  const onBack = selected.id === back?.id

  function picture(face: ObjectFace) {
    const aspect = aspectOf(face.width, face.height)
    return (
      <Cutout
        width={cutoutWidth(silhouette, aspect, { min: width * 0.82, max: width })}
        silhouette={silhouette}
        cut={cut}
        rotate={rotate}
        aspect={aspect}
        src={face.cutoutUrl ?? undefined}
        thumbSrc={face.thumbUrl ?? undefined}
        eager
        alt={`${title}, ${labels[face.role].toLowerCase()}`}
        label={face.cutoutUrl ? undefined : `${labels[face.role]} pending${kind ? ` · ${kind}` : ''}`}
        interactive
      />
    )
  }

  return (
    <div className="flex flex-col items-center" style={{ perspective: 800 }}>
      {turning ? (
        <div
          className="grid transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ width, transformStyle: 'preserve-3d', transform: `rotateY(${onBack ? 180 : 0}deg)` }}
        >
          {[front, back].map((face, index) => (
            <div
              key={face.id}
              aria-hidden={selected.id !== face.id}
              className="flex items-center justify-center"
              style={{
                gridArea: '1 / 1',
                backfaceVisibility: 'hidden',
                transform: `rotateY(${index * 180}deg)`,
                pointerEvents: selected.id === face.id ? undefined : 'none',
              }}
            >
              {picture(face)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center" style={{ width }}>{picture(selected)}</div>
      )}
      {ordered.length > 1 ? (
        <div className="mn mt-3 flex flex-wrap justify-center gap-1 text-[8.5px] tracking-[0.1em]" role="group" aria-label="Object photographs">
          {ordered.map((face, index) => (
            <button
              key={face.id}
              type="button"
              aria-pressed={face.id === selected.id}
              onClick={() => setSelectedId(face.id)}
              className="min-h-11 min-w-11 px-2 uppercase aria-pressed:text-accent"
            >
              {labels[face.role]}{ordered.filter((item) => item.role === face.role).length > 1 ? ` ${ordered.slice(0, index + 1).filter((item) => item.role === face.role).length}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
