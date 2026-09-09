import { useEffect, useState } from 'react'
import { validCoordinates, type PlaceCoordinates } from '@/lib/offline/taxonomy'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'
const coordinateLabel = (value: PlaceCoordinates) => `${value.lat ?? 'Not set'}, ${value.lng ?? 'Not set'}`

export function OfflineCoordinateEditor({ id, name, initial, linkedCount, review, onSave, onDiscard, onClose }: {
  id: string
  name: string
  initial: PlaceCoordinates
  linkedCount: number
  review?: { archive: PlaceCoordinates | null; rejected: boolean }
  onSave: (coordinates: { lat: number; lng: number }) => Promise<void>
  onDiscard: () => Promise<void>
  onClose: () => void
}) {
  const [lat, setLat] = useState(String(initial.lat ?? '')), [lng, setLng] = useState(String(initial.lng ?? ''))
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const dirty = lat !== String(initial.lat ?? '') || lng !== String(initial.lng ?? '')
  const unavailable = review && (!review.archive || review.rejected)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  async function save(discard = false) {
    setSaving(true); setError('')
    try {
      if (discard) await onDiscard()
      else {
        const value = lat.trim() && lng.trim() ? { lat: Number(lat), lng: Number(lng) } : null
        if (!validCoordinates(value)) throw new Error('Enter latitude from −90 to 90 and longitude from −180 to 180.')
        await onSave(value)
      }
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Coordinates could not be saved. Your entries are still here.') }
    finally { setSaving(false) }
  }
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[620px] px-6 pb-10">
    <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={saving} onClick={() => { if (!dirty || window.confirm('Leave without saving these coordinates?')) onClose() }}>BACK TO ARCHIVE</button></nav>
    <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{review ? 'Review place coordinates.' : 'Edit place coordinates.'}</h1>
    <p className="mt-3 break-words text-[16px]">{name}</p>
    <p className="mt-3 text-[14px] leading-relaxed text-mute-2">Enter where objects associated with this place were received. Saving changes the place coordinates for all {linkedCount} linked {linkedCount === 1 ? 'object' : 'objects'}.</p>
    {review ? <><p className="mt-4 text-[14px]">{!review.archive ? 'This place was removed. Save your local coordinates before discarding the change.' : review.rejected ? 'The archive could not accept these coordinates. Save a copy before discarding the change.' : 'Coordinates changed elsewhere. Keep the archive pair or save the pair you want to use.'}</p><dl className="mt-5 grid gap-4 sm:grid-cols-2">{[['ON THIS DEVICE', coordinateLabel(initial)], ['IN THE ARCHIVE', review.archive ? coordinateLabel(review.archive) : 'Removed']].map(([label,value]) => <div key={label}><dt className="mn text-[9px] tracking-[0.1em]">{label}</dt><dd className="mt-2 text-[16px]">{value}</dd></div>)}</dl></> : null}
    <form className="mt-6" onSubmit={event => { event.preventDefault(); void save() }}>
      {!unavailable ? <div className="grid gap-5 sm:grid-cols-2">{[{ label: 'LATITUDE', value: lat, set: setLat, limit: 90 }, { label: 'LONGITUDE', value: lng, set: setLng, limit: 180 }].map(field => <label key={field.label} className="grid gap-2"><span className="mn text-[9px] tracking-[0.1em]">{field.label}</span><input type="number" step="any" min={-field.limit} max={field.limit} required value={field.value} onChange={event => field.set(event.target.value)} disabled={saving} className="min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[16px] focus-visible:outline-2 focus-visible:outline-accent" /></label>)}</div> : null}
      {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">{!unavailable ? <button type="submit" disabled={saving} className={buttonClass}>{saving ? 'SAVING…' : 'SAVE COORDINATES ON DEVICE'}</button> : null}{review ? <button type="button" className={buttonClass} disabled={saving} onClick={() => { void save(true) }}>{unavailable ? 'DISCARD LOCAL COORDINATE CHANGE' : 'KEEP ARCHIVE COORDINATES'}</button> : null}</div>
    </form>
    {review || dirty ? <a className={`${buttonClass} mt-4 inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity: 'place', id, name, latitude: lat, longitude: lng, archive: review?.archive }, null, 2))}`} download={`capsule-place-${id}-coordinates.json`}>SAVE LOCAL COORDINATES</a> : null}
  </div></main>
}
