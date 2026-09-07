import { useEffect, useState } from 'react'

import { personNote } from '@/lib/offline/taxonomy'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineNoteEditor({ id, initialNote, review, onSave, onDiscard, onClose }: {
  id: string
  initialNote: string | null
  review?: { archiveNote: string | null; missing: boolean; rejected: boolean }
  onSave: (note: string | null) => Promise<void>
  onDiscard: () => Promise<void>
  onClose: () => void
}) {
  const [note, setNote] = useState(initialNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = personNote(note) !== personNote(initialNote)
  const unavailable = review && (review.missing || review.rejected)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  async function save(discard = false) {
    setSaving(true); setError('')
    try { if (discard) await onDiscard(); else await onSave(personNote(note)); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The note could not be saved. Your text is still here.') }
    finally { setSaving(false) }
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={() => { if (!dirty || window.confirm('Leave without saving this note?')) onClose() }}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{review ? 'Review this note.' : 'Edit person note.'}</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">{review ? review.missing ? 'This person was removed from the archive. Save your local note before discarding the change.' : review.rejected ? 'The archive could not accept this note. Save your local text before discarding the change.' : 'This note changed elsewhere. Keep the archive note or save the text you want to use.' : 'The note is saved on this device before syncing. Leave it empty to clear it.'}</p>
    {review ? <dl className="mt-6 grid gap-5 border-t border-hair pt-4 sm:grid-cols-2">{[['ON THIS DEVICE', initialNote ?? 'No note'], ['IN THE ARCHIVE', review.missing ? 'Removed' : review.archiveNote ?? 'No note']].map(([label, value]) => <div key={label}><dt className="mn text-[9px] tracking-[0.1em] text-mute-2">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-[16px]">{value}</dd></div>)}</dl> : null}
    <form className="mt-6" onSubmit={event => { event.preventDefault(); void save() }}>
      {!unavailable ? <label className="grid gap-2"><span className="mn text-[9px] tracking-[0.1em]">NOTE</span><textarea value={note} onChange={event => setNote(event.target.value)} rows={8} maxLength={20000} disabled={saving} className="min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[16px] focus-visible:outline-2 focus-visible:outline-accent" /></label> : null}
      {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">{!unavailable ? <button type="submit" disabled={saving || note.length > 20000} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE NOTE ON DEVICE'}</button> : null}
        {review ? <button type="button" className={buttonClass} disabled={saving} onClick={() => { void save(true) }}>{unavailable ? 'DISCARD LOCAL NOTE CHANGE' : 'KEEP ARCHIVE NOTE'}</button> : null}
      </div>
    </form>
    {review ? <a className={`${buttonClass} mt-4 inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity: 'person', id, note: personNote(note), archiveNote: review.archiveNote, missing: review.missing }, null, 2))}`} download={`capsule-person-${id}-note.json`}>SAVE LOCAL NOTE</a> : null}
  </div></main>
}
