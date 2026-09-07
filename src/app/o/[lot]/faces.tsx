'use client'

import { ObjectFaces, type ObjectFace } from '@/components/object-faces'
import type { CutStyle, Silhouette } from '@/design'

export function Faces({
  faces,
  silhouette,
  cut,
  rotate,
  title,
  kind,
}: {
  faces: ObjectFace[]
  silhouette: Silhouette
  cut: CutStyle
  rotate: number
  title: string
  kind: string | null
}) {
  return (
    <div className="w-full px-6 pt-8 pb-6" style={{ background: 'linear-gradient(var(--bg), var(--panel))' }}>
      <ObjectFaces faces={faces} silhouette={silhouette} cut={cut} rotate={rotate} title={title} kind={kind} width={250} />
    </div>
  )
}
