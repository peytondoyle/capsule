import { useState } from 'react'
import type { OccasionMergeBase } from '@/lib/offline/types'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineOccasionMerge({ id, source, destinations, review, linkLabel, onMerge, onKeep, onClose }: {
  id: string
  source: OccasionMergeBase
  destinations: Array<{ id: string; base: OccasionMergeBase }>
  review?: { targetId: string; source: OccasionMergeBase | null; target: OccasionMergeBase | null; refreshed: boolean; canRetry: boolean }
  linkLabel: (id: string) => string
  onMerge: (targetId: string, expected: string) => Promise<void>
  onKeep: () => Promise<void>
  onClose: () => void
}) {
  const [targetId, setTargetId] = useState(review?.targetId ?? '')
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const target = destinations.find(row => row.id === targetId)?.base
  async function save(merge: boolean) {
    if (merge && !target) return
    setSaving(true); setError('')
    try { if (merge) await onMerge(targetId, JSON.stringify({ source, target })); else await onKeep(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The merge could not be saved. Try again.') }
    finally { setSaving(false) }
  }
  function details(value: OccasionMergeBase | null | undefined, label: string) {
    return <section className="min-w-0 border-t border-hair pt-4"><h2 className="mn text-[10px] tracking-[0.1em] text-mute-2">{label}</h2>{value ? <>
      <p className="mt-4 whitespace-pre-wrap break-words text-[14px]">{String(value.metadata.name)}</p>
      <p className="mn mt-5 text-[9px] tracking-[0.1em]">{value.links.length} LINKED OBJECTS</p>
      <ul className="mt-2 space-y-2">{value.links.map(link => <li key={link} className="break-words text-[13px]">{linkLabel(link)}</li>)}</ul>
    </> : <p className="mt-4 text-[14px]">No longer in the archive.</p>}</section>
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{review ? 'Review this merge.' : 'Merge this occasion?'}</h1>
    <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-mute-2">{review ? 'The archive could not apply this merge. Compare both entries and their links before choosing again.' : 'Move this occasion’s object links to another occasion, then remove this entry. The destination name and details stay unchanged. Your objects and photographs stay in place.'}</p>
    {!review ? <label className="mt-6 grid gap-2"><span className="mn text-[9px] tracking-[0.1em]">DESTINATION OCCASION</span><select value={targetId} disabled={saving} onChange={event => setTargetId(event.target.value)} className="min-h-11 border-b border-hair-strong bg-transparent px-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent"><option value="">Choose an occasion</option>{destinations.map(row => <option key={row.id} value={row.id}>{String(row.base.metadata.name)}</option>)}</select></label> : null}
    {!review && !destinations.length ? <p role="status" className="mt-4 text-[14px]">No other saved occasion is available. Sync pending changes or add another occasion first.</p> : null}
    <div className="mt-6 grid gap-6 sm:grid-cols-2">{details(source, 'SOURCE TO REMOVE')}{target ? details(target, 'DESTINATION TO KEEP') : null}</div>
    {review ? review.refreshed ? <div className="mt-6 grid gap-6 sm:grid-cols-2">{details(review.source, 'CURRENT SOURCE')}{details(review.target, 'CURRENT DESTINATION')}</div> : <p role="status" className="mt-4 text-[14px]">Return to the archive and sync saved edits to refresh both entries before choosing.</p> : null}
    {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3">
      {!review || review.canRetry ? <button type="button" disabled={saving || !target || !!review && !review.refreshed} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50" onClick={() => { void save(true) }}>{saving ? 'SAVING…' : review ? 'MERGE CURRENT ENTRIES' : 'SAVE MERGE ON DEVICE'}</button> : null}
      {review ? <button type="button" disabled={saving || !review.refreshed} className={buttonClass} onClick={() => { void save(false) }}>KEEP ARCHIVE ENTRIES</button> : <button type="button" disabled={saving} className={buttonClass} onClick={onClose}>KEEP SEPARATE</button>}
    </div>
    <a className={`${buttonClass} mt-4 inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity: 'occasion', id, targetId, source, target, current: review ? { source: review.source, target: review.target } : undefined }, null, 2))}`} download={`capsule-occasion-${id}-merge.json`}>SAVE ENTRIES AND LINKS</a>
  </div></main>
}
