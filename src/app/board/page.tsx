import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getBoard } from '@/server/board'
import { getCurrentUser } from '@/server/auth'
import { countUnfiled } from '@/server/objects'
import { BoardCanvas } from './canvas'

export const metadata: Metadata = { title: 'Board — Capsule' }

export default async function BoardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [{ items, clusters }, unfiled] = await Promise.all([
    getBoard(user.id),
    countUnfiled(user.id),
  ])

  return (
    <div data-surface="board" className="relative h-dvh overflow-hidden bg-bg text-ink">
      <h1 className="sr-only">Board</h1>
      <BoardCanvas
        items={items.map((row) => ({
          id: row.object.id,
          lotNo: row.object.lotNo,
          title: row.object.title,
          kind: row.object.kind,
          silhouette: row.object.silhouette,
          cutStyle: row.object.cutStyle,
          rotationDeg: row.object.rotationDeg,
          cutoutUrl: row.recto?.cutoutUrl ?? null,
          faceW: row.recto?.width ?? null,
          faceH: row.recto?.height ?? null,
          giver: row.giver,
          x: row.x,
          y: row.y,
          z: row.z,
        }))}
        clusters={clusters.map(({ collection, count }) => ({
          id: collection.id,
          name: collection.name.toUpperCase(),
          x: collection.boardX ?? 100,
          y: collection.boardY ?? 100,
          w: collection.boardW ?? 300,
          h: collection.boardH ?? 250,
          count,
          impliedTags: Array.isArray(collection.impliedTags)
            ? (collection.impliedTags as string[])
            : [],
        }))}
      />

      <nav className="mn absolute top-5 left-5 flex flex-col gap-1 rounded-[12px] border border-hair-strong p-1.5 text-[9px] tracking-[0.08em]"
        style={{ background: 'color-mix(in srgb, var(--panel) 94%, transparent)', backdropFilter: 'blur(12px)' }}
      >
        <Link href="/timeline" className="rounded-md px-2.5 py-1.5" style={{ color: 'var(--mute-2)' }}>
          LEDGER
        </Link>
        <span
          aria-current="page"
          className="rounded-md bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] px-2.5 py-1.5 font-medium"
        >
          BOARD
        </span>
        <Link href="/cabinet" className="rounded-md px-2.5 py-1.5" style={{ color: 'var(--mute-2)' }}>
          CABINET
        </Link>
      </nav>

      {unfiled > 0 ? (
        <Link
          href="/queue"
          className="absolute bottom-5 left-5 flex items-center gap-2.5 rounded-[10px] border border-hair-strong px-3.5 py-2.5"
          style={{
            background: 'color-mix(in srgb, var(--panel) 94%, transparent)',
            boxShadow: '0 8px 22px rgb(var(--shadow-ink) / 0.12)',
          }}
        >
          <span className="size-[7px] rounded-full" style={{ background: 'var(--accent)' }} />
          <span className="text-[11.5px]" style={{ color: 'var(--mute-1)' }}>
            {unfiled} object{unfiled === 1 ? '' : 's'} still unfiled
          </span>
          <span className="mn text-[9px] tracking-[0.08em]" style={{ color: 'var(--mute-3)' }}>
            REVIEW
          </span>
        </Link>
      ) : null}
    </div>
  )
}
