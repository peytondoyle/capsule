import { useState } from 'react'
import { reviewShelfOrder, shelfOrderBase, shelfOrderRows, shelfOrders } from '@/lib/offline/shelves'
import type { LocalArchive, OutboxEntry } from '@/lib/offline/store'
import type { SyncSnapshot } from '@/lib/offline/types'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineShelfOrder({ snapshot, archive, operations, onSave, onKeep, onClose }: {
  snapshot: SyncSnapshot
  archive: LocalArchive
  operations: OutboxEntry[]
  onSave: (expected: string, ids: string[]) => Promise<void>
  onKeep: (token: string) => Promise<void>
  onClose: () => void
}) {
  const rows = shelfOrderRows(snapshot), pending = shelfOrders(operations)[0], review = reviewShelfOrder(archive, operations)
  const [ids, setIds] = useState(() => rows.map(row => row.id)), [expected] = useState(() => JSON.stringify(shelfOrderBase(snapshot)))
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const blocked = !!pending || rows.some(row => row.localOnly || row.pendingCreation)
  const dirty = JSON.stringify(ids) !== JSON.stringify(rows.map(row => row.id))
  function move(index: number, direction: number) {
    const next = [...ids]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; setIds(next)
  }
  async function save(keep = false) {
    setSaving(true); setError('')
    try { if (keep && review) await onKeep(review.token); else await onSave(expected, ids) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The order could not be saved. Your arrangement is still here.') }
    finally { setSaving(false) }
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>{dirty ? 'CANCEL ARRANGEMENT' : 'BACK TO SHELVES'}</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">Arrange shelves.</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">Move shelves into the order you want, then save the arrangement on this device.</p>
    {pending ? <p role="status" className="mt-4 text-[13px]">{review ? 'The shelf order needs review. Keep the archive order below, then arrange again.' : 'Order saved on device. Sync before arranging again.'}</p> : blocked ? <p role="status" className="mt-4 text-[13px]">Sync new shelves before arranging them.</p> : null}
    {pending || dirty ? <a className={`${buttonClass} inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ mutation: pending?.mutation, ...(dirty ? { draft: { type: 'collection.reorder', base: JSON.parse(expected), ids } } : {}), shelves: rows.map(row => ({ id: row.id, name: row.name })) }, null, 2))}`} download={`capsule-shelf-order-${pending?.operationId ?? 'draft'}.json`}>SAVE LOCAL SHELF ORDER</a> : null}
    <ol className="mt-6">{ids.map((id, index) => <li key={id} className="border-b border-hair py-3"><h2 className="break-words text-[16px]">{String(rows.find(row => row.id === id)?.name ?? id)}</h2><button type="button" aria-label={`Move shelf ${index + 1} up`} className={buttonClass} disabled={saving || blocked || index === 0} onClick={() => move(index, -1)}>MOVE UP</button><button type="button" aria-label={`Move shelf ${index + 1} down`} className={buttonClass} disabled={saving || blocked || index === ids.length - 1} onClick={() => move(index, 1)}>MOVE DOWN</button></li>)}</ol>
    {!pending ? <button type="button" className={`${buttonClass} mt-4`} disabled={saving || blocked || !dirty} onClick={() => { void save() }}>{saving ? 'SAVING…' : 'SAVE ORDER ON DEVICE'}</button> : null}
    {rows.length < 2 ? <p className="mt-4 text-[13px]">Save at least two shelves to arrange them.</p> : null}
    {review ? <section className="mt-6 border-t border-hair pt-4"><h2 className="text-[16px]">Archive order</h2>{review.refreshed ? <ol>{shelfOrderRows(archive.snapshot).map(row => <li key={row.id} className="mt-2 break-words text-[14px]">{String(row.name)}</li>)}</ol> : <p className="mt-2 text-[13px]">Return to the archive and sync to refresh its order before reviewing.</p>}<button type="button" className={`${buttonClass} mt-3`} disabled={saving || !review.refreshed} onClick={() => { void save(true) }}>KEEP ARCHIVE ORDER</button></section> : null}
    {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
  </div></main>
}
