import { useEffect, useState } from 'react'

import type { TaxonomyEntity } from '@/lib/offline/taxonomy'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineNameEditor({ entity, id, initialName, review, onSave, onDiscard, onClose }: {
  entity: TaxonomyEntity
  id: string
  initialName: string
  review?: { archiveName: string | null; rejected: boolean; nameTaken: boolean }
  onSave: (name: string) => Promise<void>
  onDiscard: () => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = name.trim() !== initialName
  const unavailable = review && (review.archiveName === null || review.rejected && !review.nameTaken)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  async function save(discard = false) {
    if (!discard && !name.trim()) { setError('Enter a name before saving.'); return }
    setSaving(true); setError('')
    try { if (discard) await onDiscard(); else await onSave(name.trim()); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The name could not be saved. Your text is still here.') }
    finally { setSaving(false) }
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={() => { if (!dirty || window.confirm('Leave without saving this name?')) onClose() }}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{review ? 'Review this name.' : `Rename this ${entity}.`}</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">{review ? review.archiveName === null ? 'This entry was removed from the archive. Save your local name before discarding the rename.' : review.nameTaken ? 'That name is already used in your archive. Choose a different name or keep the archive name.' : review.rejected ? 'The archive could not accept this rename. Save your local name before discarding it.' : 'This name changed elsewhere. Keep the archive name or save the name you want to use.' : 'The new name will appear on every linked object. It is saved on this device before syncing.'}</p>
    {review ? <dl className="mt-6 grid gap-5 border-t border-hair pt-4 sm:grid-cols-2">{[['ON THIS DEVICE', initialName], ['IN THE ARCHIVE', review.archiveName ?? 'Removed']].map(([label, value]) => <div key={label}><dt className="mn text-[9px] tracking-[0.1em] text-mute-2">{label}</dt><dd className="mt-2 break-words text-[16px]">{value}</dd></div>)}</dl> : null}
    <form className="mt-6" onSubmit={event => { event.preventDefault(); void save() }}>
      {!unavailable ? <label className="grid gap-2"><span className="mn text-[9px] tracking-[0.1em]">NAME</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={250} disabled={saving} className="min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[16px] focus-visible:outline-2 focus-visible:outline-accent" /></label> : null}
      {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">{!unavailable ? <button type="submit" disabled={saving || !name.trim()} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE NAME ON DEVICE'}</button> : null}
        {review ? <button type="button" className={buttonClass} disabled={saving} onClick={() => { void save(true) }}>{unavailable ? 'DISCARD LOCAL RENAME' : 'KEEP ARCHIVE NAME'}</button> : null}
      </div>
    </form>
    {review ? <a className={`${buttonClass} mt-4 inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity, id, name, archiveName: review.archiveName }, null, 2))}`} download={`capsule-${entity}-${id}-name.json`}>SAVE LOCAL NAME</a> : null}
  </div></main>
}
