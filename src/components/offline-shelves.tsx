import { offlineHref } from '@/lib/offline/navigation'
import { shelfEdits } from '@/lib/offline/shelves'
import type { OutboxEntry } from '@/lib/offline/store'
import type { SyncSnapshot } from '@/lib/offline/types'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineShelves({ snapshot, operations, onRename, onClose }: {
  snapshot: SyncSnapshot
  operations: OutboxEntry[]
  onRename: (id: string) => void
  onClose: () => void
}) {
  const shelves = snapshot.collections.filter(row => row.kind === 'shelf').sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.id.localeCompare(b.id))
  const reviews = [...new Set(operations.flatMap(entry => entry.mutation.type === 'collection.upsert' && entry.mutation.id && ['conflict', 'rejected'].includes(entry.response?.outcome ?? '') ? [entry.mutation.id] : []))]
  const objectIds = new Set(snapshot.records.map(row => row.id))
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} onClick={onClose}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">Saved shelves.</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">Rename shelves saved in your archive. Names are saved on this device before syncing.</p>
    {reviews.filter(id => !shelves.some(row => row.id === id)).map(id => <button key={id} type="button" className={buttonClass} onClick={() => onRename(id)}>REVIEW UNAVAILABLE SHELF NAME</button>)}
    <ul className="mt-6">{shelves.map(row => {
      const count = new Set(snapshot.memberships.filter(link => link.collectionId === row.id && objectIds.has(link.objectId)).map(link => link.objectId)).size
      return <li key={row.id} className="border-b border-hair py-4"><h2 className="break-words text-[16px] font-medium">{String(row.name)}</h2><p className="mn mt-2 text-[9px] tracking-[0.1em] text-mute-2">{count} {count === 1 ? 'OBJECT' : 'OBJECTS'}</p>{shelfEdits(operations, row.id).length ? <p className="mn mt-2 text-[9px] tracking-[0.1em] text-accent">{reviews.includes(row.id) ? 'NAME NEEDS REVIEW' : 'NAME SAVED ON DEVICE'}</p> : null}
        <button type="button" className={buttonClass} disabled={!!row.localOnly} onClick={() => onRename(row.id)}>{reviews.includes(row.id) ? 'REVIEW NAME' : 'RENAME SHELF'}</button><a href={offlineHref({ filter: `collection:${row.id}` })} className={`${buttonClass} inline-flex items-center`}>OPEN OBJECTS</a>
        {row.localOnly ? <p className="mt-2 text-[13px] text-mute-2">Sync this new shelf before renaming it.</p> : null}
      </li>
    })}</ul>
    {!shelves.length ? <p role="status" className="mt-6 text-[14px] text-mute-2">No saved shelves yet. Add a collection while editing an object’s details, then sync it.</p> : null}
  </div></main>
}
