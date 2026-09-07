import { useState } from 'react'
import type { TaxonomyEntity } from '@/lib/offline/taxonomy'
import type { deletionBase } from '@/lib/offline/taxonomy-delete'

type Base = ReturnType<typeof deletionBase>
const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'
const labels: Record<string, string> = { name: 'Name', initials: 'Initials', note: 'Notes', lat: 'Latitude', lng: 'Longitude', kind: 'Kind', avatarUrl: 'Portrait' }

export function OfflineTaxonomyDelete({ entity, id, base, current, review, canRetry, refreshed, linkLabel, onRemove, onKeep, onClose }: {
  entity: TaxonomyEntity
  id: string
  base: Base
  current?: Base | null
  review: boolean
  canRetry: boolean
  refreshed: boolean
  linkLabel: (link: string) => string
  onRemove: () => Promise<void>
  onKeep: () => Promise<void>
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  async function save(remove: boolean) {
    setSaving(true); setError('')
    try { await (remove ? onRemove() : onKeep()); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The removal could not be saved. Please try again.') }
    finally { setSaving(false) }
  }
  function details(value: Base | null | undefined, label: string) {
    return <section className="min-w-0 border-t border-hair pt-4"><h2 className="mn text-[10px] tracking-[0.1em] text-mute-2">{label}</h2>{value ? <>
      <dl className="mt-4 grid gap-3">{Object.entries(value.metadata).filter(([key, value]) => labels[key] && value !== null && value !== '').map(([key, value]) => <div key={key}><dt className="mn text-[9px] tracking-[0.1em] text-mute-2">{labels[key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-[14px]">{String(value)}</dd></div>)}</dl>
      <p className="mn mt-5 text-[9px] tracking-[0.1em]">{value.links.length} {value.links.length === 1 ? 'LINK' : 'LINKS'} TO REMOVE</p>
      <ul className="mt-2 space-y-2">{value.links.map(link => <li key={link} className="break-words text-[13px]">{linkLabel(link)}</li>)}</ul>
    </> : <p className="mt-4 text-[14px]">Already removed from the archive.</p>}</section>
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{review ? 'Review this removal.' : `Remove this ${entity}?`}</h1>
    <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-mute-2">{review ? 'The archive could not apply your removal. Compare the saved entry and its current links before choosing again.' : 'This removes the entry and its links from your archive. Your objects and photographs stay in place. The removal is saved on this device before syncing.'}</p>
    {review && !refreshed ? <p role="status" className="mt-4 text-[14px]">Return to the archive and sync saved edits to load the latest entry before choosing.</p> : null}
    <div className={`mt-6 grid gap-6 ${review && refreshed ? 'sm:grid-cols-2' : ''}`}>{details(base, 'SAVED REMOVAL')}{review && refreshed ? details(current, 'CURRENT ARCHIVE') : null}</div>
    {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3">
      {canRetry ? <button type="button" disabled={saving || !refreshed} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50" onClick={() => { void save(true) }}>{saving ? 'SAVING…' : review ? 'REMOVE CURRENT ENTRY AND LINKS' : 'SAVE REMOVAL ON DEVICE'}</button> : null}
      {review ? <button type="button" disabled={saving || !refreshed} className={buttonClass} onClick={() => { void save(false) }}>{current ? 'KEEP ARCHIVE ENTRY' : 'DISMISS REMOVAL'}</button> : <button type="button" disabled={saving} className={buttonClass} onClick={onClose}>KEEP ENTRY</button>}
    </div>
    <a className={`${buttonClass} mt-4 inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity, id, base, current }, null, 2))}`} download={`capsule-${entity}-${id}-removal.json`}>SAVE ENTRY AND LINKS</a>
  </div></main>
}
