import { useState } from 'react'
import { editLabels, type reviewObject, type EditField } from '@/lib/offline/edits'
import { isLinkField, sameField, type LinkReference } from '@/lib/offline/links'
import { textValue } from '@/lib/offline/library'
import type { SyncSnapshot } from '@/lib/offline/types'

type Review = NonNullable<ReturnType<typeof reviewObject>>

export function OfflineConflictReview({ review, snapshot, onResolve }: { review: Review; snapshot: SyncSnapshot; onResolve: (choices: Record<string, 'local' | 'remote'>, discard?: boolean) => Promise<void> }) {
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>(() => Object.fromEntries(review.fields.filter((field) => sameField(field, review.local?.[field], review.remote?.[field])).map((field) => [field, 'remote'])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const unavailable = !review.remote || review.rejected
  async function resolve(discard = false) {
    if (discard && !window.confirm('Discard the pending local changes for this object?')) return
    setSaving(true); setError('')
    try { await onResolve(choices, discard) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The review could not be saved.') }
    finally { setSaving(false) }
  }
  function display(field: string, value: unknown) {
    if (value === null || value === undefined || value === '') return 'Not set'
    if (isLinkField(field)) return (value as LinkReference[]).map(ref => ref.name).join(', ') || 'None'
    if (field === 'placeId') return textValue(snapshot.places.find((row) => row.id === value)?.name) || String(value)
    if (field === 'occasionId') return textValue(snapshot.occasions.find((row) => row.id === value)?.name) || String(value)
    if (field === 'retention') return value === 'retained' ? 'Still have it' : 'Only here now'
    return String(value)
  }
  return <section className="mt-6 border-t border-hair pt-5">
    <h2 className="text-[20px] font-semibold tracking-tight">Review these changes.</h2>
    <p className="mt-2 text-[13px] leading-relaxed text-mute-2">{review.rejected ? 'The archive could not accept these edits. Save your local details using “Save local details” before discarding them.' : !review.remote ? 'This object was deleted from the archive. Your edited details are still here and can be saved with “Save local details”.' : 'This object changed elsewhere. Choose which version to keep for each field. Other details stay as they are.'}</p>
    {!unavailable ? <fieldset disabled={saving} className="mt-4">{review.fields.map((field) => <div key={field} className="border-t border-hair py-4">
      <p className="mn text-[9px] uppercase tracking-[0.1em]">{editLabels[field as EditField] ?? field}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{[['ON THIS DEVICE', review.local?.[field]], ['IN THE ARCHIVE', review.remote?.[field]]].map(([label, value]) => <div key={String(label)}><p className="mn text-[8px] tracking-[0.1em] text-mute-2">{String(label)}</p><p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[14px] leading-relaxed">{display(field, value)}</p></div>)}</div>
      <label className="mt-3 grid gap-1"><span className="mn text-[8px] tracking-[0.1em] text-mute-2">VERSION FOR {editLabels[field as EditField]?.toUpperCase() ?? field.toUpperCase()}</span><select value={choices[field] ?? ''} className="min-h-11 border-b border-hair-strong bg-transparent px-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent" onChange={(event) => setChoices((current) => ({ ...current, [field]: event.target.value as 'local' | 'remote' }))}><option value="" disabled>Choose a version</option><option value="local">Keep my local version</option><option value="remote">Keep the archive version</option></select></label>
    </div>)}</fieldset> : null}
    {error ? <p role="alert" className="mt-3 text-[13px] text-accent">{error}</p> : null}
    <div className="mt-4 flex flex-wrap gap-3">{!unavailable ? <button type="button" disabled={saving || review.fields.some((field) => !choices[field])} className="mn min-h-11 bg-ink px-4 text-[9px] tracking-[0.1em] text-bg disabled:opacity-50" onClick={() => { void resolve() }}>{saving ? 'SAVING…' : 'SAVE RESOLUTION'}</button> : null}<button type="button" disabled={saving} className="mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline" onClick={() => { void resolve(true) }}>DISCARD LOCAL CHANGES</button></div>
  </section>
}
