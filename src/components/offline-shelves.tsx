import { useState } from 'react'
import { offlineHref } from '@/lib/offline/navigation'
import { shelfCreations, shelfEdits } from '@/lib/offline/shelves'
import type { OutboxEntry } from '@/lib/offline/store'
import type { SyncSnapshot } from '@/lib/offline/types'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineShelves({ snapshot, operations, onRename, onCreate, onDiscardCreation, onOrder, onClose }: {
  snapshot: SyncSnapshot
  operations: OutboxEntry[]
  onRename: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onDiscardCreation: (operationId: string) => Promise<void>
  onOrder: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('')
  async function save(operationId?: string) {
    setSaving(true); setError('')
    try { if (operationId) await onDiscardCreation(operationId); else { await onCreate(name); setName('') } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The shelf could not be saved. Your name is still here.') }
    finally { setSaving(false) }
  }
  const creations = shelfCreations(operations)
  const shelves = snapshot.collections.filter(row => row.kind === 'shelf').sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.id.localeCompare(b.id))
  const reviews = [...new Set(operations.flatMap(entry => entry.mutation.type === 'collection.upsert' && entry.mutation.id && ['conflict', 'rejected'].includes(entry.response?.outcome ?? '') ? [entry.mutation.id] : []))]
  const objectIds = new Set(snapshot.records.map(row => row.id))
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">Saved shelves.</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">Create an empty shelf or rename a saved shelf. Changes are saved on this device before syncing.</p>
    <button type="button" className={`${buttonClass} mt-3`} disabled={saving} onClick={onOrder}>ARRANGE SHELVES</button>
    <form className="mt-6" onSubmit={event => { event.preventDefault(); void save() }}><label className="grid gap-2"><span className="mn text-[9px] tracking-[0.1em]">NEW SHELF NAME</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={250} disabled={saving} className="min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[16px] focus-visible:outline-2 focus-visible:outline-accent" /></label><button type="submit" disabled={saving || !name.trim()} className={`${buttonClass} mt-3`}>{saving ? 'SAVING…' : 'CREATE SHELF ON DEVICE'}</button></form>
    {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
    {creations.filter(entry => entry.response?.outcome === 'rejected').map(entry => <section key={entry.operationId} className="mt-4 border-b border-hair pb-3"><p className="break-words text-[14px]">The archive could not create {entry.mutation.type === 'collection.create' ? entry.mutation.values.name : 'this shelf'}. Save a copy of the name before discarding it.</p><a className={`${buttonClass} inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(entry.mutation, null, 2))}`} download={`capsule-shelf-${entry.operationId}.json`}>SAVE NEW SHELF DETAILS</a><button type="button" className={buttonClass} disabled={saving} onClick={() => { void save(entry.operationId) }}>DISCARD REJECTED SHELF</button></section>)}
    {reviews.filter(id => !shelves.some(row => row.id === id)).map(id => <button key={id} type="button" className={buttonClass} onClick={() => onRename(id)}>REVIEW UNAVAILABLE SHELF NAME</button>)}
    <ul className="mt-6">{shelves.map(row => {
      const count = new Set(snapshot.memberships.filter(link => link.collectionId === row.id && objectIds.has(link.objectId)).map(link => link.objectId)).size
      return <li key={row.id} className="border-b border-hair py-4"><h2 className="break-words text-[16px] font-medium">{String(row.name)}</h2><p className="mn mt-2 text-[9px] tracking-[0.1em] text-mute-2">{count} {count === 1 ? 'OBJECT' : 'OBJECTS'}</p>{shelfEdits(operations, row.id).length ? <p className="mn mt-2 text-[9px] tracking-[0.1em] text-accent">{reviews.includes(row.id) ? 'NAME NEEDS REVIEW' : 'NAME SAVED ON DEVICE'}</p> : null}
        <button type="button" className={buttonClass} disabled={saving || !!row.localOnly || !!row.pendingCreation} onClick={() => onRename(row.id)}>{reviews.includes(row.id) ? 'REVIEW NAME' : 'RENAME SHELF'}</button><a href={offlineHref({ filter: `collection:${row.id}` })} className={`${buttonClass} inline-flex items-center`}>OPEN OBJECTS</a>
        {row.pendingCreation ? <p className="mt-2 text-[13px] text-mute-2">Sync this new shelf before adding objects or renaming it.</p> : row.localOnly ? <p className="mt-2 text-[13px] text-mute-2">Sync this new shelf before renaming it.</p> : null}
      </li>
    })}</ul>
    {!shelves.length ? <p role="status" className="mt-6 text-[14px] text-mute-2">No saved shelves yet. Create one above, or add a collection while editing an object’s details.</p> : null}
  </div></main>
}
