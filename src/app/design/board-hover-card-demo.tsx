'use client'

import { Cutout, MonoLabel } from '@/design'

import { BoardHoverCard, type HoverCardObject } from '@/app/board/hover-card'

const OBJECT: HoverCardObject = {
  title: 'Boarding pass, LIS → JFK',
  giver: 'Dad',
  placeName: 'Lisbon Airport',
  receivedAt: '2019-11-12',
  receivedPrecision: 'day',
}

export function BoardHoverCardDemo() {
  return (
    <div className="grid max-w-[760px] gap-5 lg:grid-cols-2">
      <CardState label="Over a cluster" impliedTags={['Portugal', 'Paper']} />
      <CardState label="Between clusters" impliedTags={[]} />
    </div>
  )
}

function CardState({ label, impliedTags }: { label: string; impliedTags: string[] }) {
  return (
    <div>
      <MonoLabel>{label}</MonoLabel>
      <div className="relative mt-2 h-[210px] overflow-hidden rounded-[10px] border border-hair bg-[radial-gradient(120%_90%_at_50%_0%,rgb(255_255_255_/_0.55),transparent_60%)]">
        <div className="absolute top-14 left-5">
          <Cutout
            width={112}
            silhouette="ticket"
            cut="die_cut"
            rotate={-2}
            aspect={2.1}
            label="dragging"
            state="dragging"
          />
        </div>
        <BoardHoverCard
          object={OBJECT}
          impliedTags={impliedTags}
          className="absolute top-5 left-[145px]"
        />
      </div>
    </div>
  )
}
