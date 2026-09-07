import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Cutout } from './design/cutout'
import { OfflineCaptureEditor } from './components/offline-capture-editor'
import { OfflineCaptureReview } from './components/offline-capture-review'
import { OfflineLibrary } from './components/offline-library'
import { emptyCaptureDraft } from './lib/capture-draft'
import { drainCaptures } from './lib/capture-sync'
import { isHeic } from './lib/heic'
import { dismissCaptureConflict, enqueueUpload, listQueued, listRetainedOriginals, retryCaptureConflict, saveCaptureDraft, type PendingUpload } from './lib/offline-queue'
import { localOwner, lockLocalArchive, watchLocalOwner } from './lib/offline/session'

type Photograph = PendingUpload & { downloadUrl: string; previewUrl?: string; draftUrl?: string }

function OfflineApp() {
  const [ownerId, setOwnerId] = useState(localOwner)
  const [photos, setPhotos] = useState<Photograph[]>([])
  const [message, setMessage] = useState('Photographs stay on this device until an upload is confirmed.')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState<PendingUpload | null>(null)
  const [reviewing, setReviewing] = useState<Photograph | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [library, setLibrary] = useState(() => new URLSearchParams(location.search).get('view') === 'archive' || /^\/(timeline|board|cabinet|catalogue|people|places|occasions|o)(\/|$)/.test(location.pathname))
  const input = useRef<HTMLInputElement>(null)
  const urls = useRef(new Map<string, string>())
  const busy = useRef(false)
  const actions = useRef({ refresh: async () => {}, sync: async () => {} })

  useEffect(() => watchLocalOwner(() => {
    setOwnerId(localOwner())
    setEditing(null)
    setReviewing(null)
  }), [])

  useEffect(() => {
    let mounted = true
    const current = () => mounted && !!ownerId && localOwner() === ownerId
    const photoUrls = urls.current
    async function refresh() {
      if (!ownerId || !current()) return
      const [pending, retained] = await Promise.all([listQueued(ownerId), listRetainedOriginals(ownerId)])
      if (!current()) return
      const usedUrls = new Set<string>()
      function cachedUrl(key: string, bytes: Blob) {
        usedUrls.add(key)
        let url = photoUrls.get(key)
        if (!url) { url = URL.createObjectURL(bytes); photoUrls.set(key, url) }
        return url
      }
      setPhotos([...pending, ...retained].filter(photo => !photo.faceTarget).map((photo) => {
        const url = cachedUrl(photo.key, photo.bytes)
        const previewUrl = photo.preview ? cachedUrl(`${photo.key}:preview:${photo.draftRevision}`, photo.preview) : isHeic(new File([], photo.name, { type: photo.type })) ? undefined : url
        const draftUrl = photo.draft ? cachedUrl(`${photo.key}:draft:${photo.draftRevision}`, new Blob([JSON.stringify(photo.draft, null, 2)], { type: 'application/json' })) : undefined
        return { ...photo, downloadUrl: url, previewUrl, draftUrl }
      }))
      for (const [key, url] of photoUrls) {
        if (!usedUrls.has(key)) { URL.revokeObjectURL(url); photoUrls.delete(key) }
      }
    }
    async function sync() {
      if (!ownerId || !current() || busy.current) return
      busy.current = true
      setSyncing(true)
      try {
        // A remembered account unlocks local capture, never a cloud write.
        const response = await fetch('/api/offline-session', { cache: 'no-store', headers: { 'x-capsule-owner': ownerId } })
        if (!current()) return
        if (response.status === 401 || response.status === 409) {
          lockLocalArchive()
          setMessage('Sign in to the account that owns these photographs to upload them. They remain saved on this device.')
          return
        }
        if (!response.ok) throw new Error('connection unavailable')
        const session = await response.json()
        if (!current() || session.ownerId !== ownerId) return
        let uploaded = 0
        let failure = ''
        const result = await drainCaptures(ownerId, {
          isActiveOwner: current,
          onProgress: (progress) => {
            if (progress.status === 'uploaded') uploaded++
            if (progress.status === 'failed') failure = progress.error ?? 'Some photographs are still waiting.'
          },
        })
        if (!current()) return
        setMessage(result === 'busy' ? 'Another Capsule tab is uploading. Return here to refresh.' : result === 'locked' ? 'Uploads are paused. Reopen Capsule online to sign in.' : failure ? failure : `${uploaded} synced. Saved drafts and originals remain available below.`)
        await refresh()
      } catch {
        if (current()) setMessage('No connection to the archive. Your photographs are saved on this device.')
      } finally {
        busy.current = false
        if (mounted) setSyncing(false)
      }
    }
    actions.current = { refresh, sync }
    void refresh().catch(() => { if (current()) setMessage('Local photo storage could not be opened. Keep your original files and reopen Capsule online.') })
    function returned() {
      void refresh().catch(() => {})
      if (navigator.onLine) void sync()
    }
    function visible() { if (document.visibilityState === 'visible') returned() }
    window.addEventListener('online', returned)
    window.addEventListener('focus', returned)
    document.addEventListener('visibilitychange', visible)
    return () => {
      mounted = false
      window.removeEventListener('online', returned)
      window.removeEventListener('focus', returned)
      document.removeEventListener('visibilitychange', visible)
      for (const url of photoUrls.values()) URL.revokeObjectURL(url)
      photoUrls.clear()
    }
  }, [ownerId])

  async function capture(files: FileList | null) {
    const picked = Array.from(files ?? [])
    if (!ownerId || localOwner() !== ownerId || !picked.length) return
    setSaving(true)
    let saved = 0
    try {
      for (const file of picked) {
        if (localOwner() !== ownerId) break
        await enqueueUpload(ownerId, file, undefined, emptyCaptureDraft)
        saved++
      }
      if (localOwner() === ownerId) {
        await actions.current.refresh()
        setMessage(`${saved} photograph${saved === 1 ? '' : 's'} saved on this device. Upload when connected.`)
      }
    } catch {
      if (localOwner() === ownerId) {
        await actions.current.refresh().catch(() => {})
        setMessage(`${saved} saved. The next photograph could not be saved—keep its original and free some device storage.`)
      }
    } finally { setSaving(false) }
  }

  const visiblePhotos = photos.filter((photo) => photo.ownerId === ownerId)
  const pending = visiblePhotos.filter((photo) => !photo.dismissed && ((!photo.itemId && !photo.captureConflict && (!photo.draft || photo.readyToFile)) || (photo.itemId && photo.prepared?.converted && !photo.originalBackup))).length
  if (ownerId && reviewing?.ownerId === ownerId) return <OfflineCaptureReview photo={reviewing} busy={reviewBusy} error={reviewError} onClose={() => setReviewing(null)} onResolve={copy => { void (async () => {
    setReviewBusy(true); setReviewError('')
    try {
      if (localOwner() !== ownerId) throw new Error('Sign in to this account to review its photographs.')
      const draft = copy ? await retryCaptureConflict(ownerId, reviewing.key, reviewing.draftRevision ?? 0) : undefined
      if (!copy) await dismissCaptureConflict(ownerId, reviewing.key, reviewing.draftRevision ?? 0)
      if (localOwner() !== ownerId) return
      await actions.current.refresh()
      setReviewing(null)
      if (draft) setEditing(draft)
      setMessage(copy ? 'A separate draft is saved. Review it before filing. The previous copy remains available to download.' : 'Filing discarded. Your original photograph and details are still saved below.')
    } catch (error) { if (localOwner() === ownerId) setReviewError(error instanceof Error ? error.message : 'Your choice could not be saved. Try again.') }
    finally { setReviewBusy(false) }
  })() }} />
  if (ownerId && library) return <OfflineLibrary key={ownerId} ownerId={ownerId} onClose={() => setLibrary(false)} />
  if (editing && editing.ownerId === ownerId) return <OfflineCaptureEditor key={editing.key} photo={editing} onClose={() => setEditing(null)} onSave={async (draft, ready, preview) => {
    if (!ownerId || localOwner() !== ownerId) throw new Error('This local account is locked. Your original photograph is still saved.')
    await saveCaptureDraft(ownerId, editing.key, draft, ready, editing.draftRevision ?? 0, preview)
    setEditing(null)
    await actions.current.refresh()
    setMessage(ready ? 'Crop and details saved. This object will be filed when connected.' : 'Draft saved on this device. Open it whenever you’re ready to file.')
  }} />
  return (
    <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-[620px] px-6 pb-10">
        <nav className="flex min-h-14 items-center justify-between border-b border-hair">
          <a href="/timeline" className="mn inline-flex min-h-11 items-center text-[10px] font-semibold tracking-[0.2em]">CAPSULE</a>
          <span className="mn text-[9px] tracking-[0.14em] text-mute-2">ON THIS DEVICE</span>
        </nav>
        <h1 className="mt-9 text-[27px] font-semibold tracking-[-0.035em]">Keep the thing.</h1>
        <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-mute-1">Photograph it now. A connection can wait.</p>
        {!ownerId ? (
          <div className="mt-8 border-t border-hair pt-6">
            <p className="text-[14px] leading-relaxed">Open Capsule online and sign in to prepare this device for offline capture. Saved photographs stay with their original account.</p>
            <a href="/sign-in" className="mn mt-5 inline-flex min-h-11 items-center text-[10px] tracking-[0.12em] underline">OPEN SIGN IN</a>
          </div>
        ) : (
          <>
            <button type="button" className="mn mt-6 inline-flex min-h-11 items-center text-[10px] tracking-[0.12em] underline" onClick={() => setLibrary(true)}>BROWSE SAVED ARCHIVE</button>
            <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={saving} onChange={(event) => { void capture(event.target.files); event.target.value = '' }} />
            <button type="button" disabled={saving} onClick={() => input.current?.click()} className="mn mt-8 min-h-11 w-full rounded-[11px] bg-ink px-4 text-[10px] tracking-[0.14em] text-bg disabled:opacity-60">{saving ? 'SAVING ON DEVICE…' : '+ ADD PHOTOGRAPHS'}</button>
            <p role="status" className="mt-4 text-[13px] leading-relaxed text-mute-2">{message}</p>
            <div className="mt-8 flex items-baseline justify-between border-b border-hair pb-3">
              <h2 className="mn text-[10px] tracking-[0.14em]">PHOTOGRAPHS</h2>
              <span className="mn text-[9px] tracking-[0.1em] text-mute-2">{pending} WAITING TO UPLOAD</span>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-8">
              {visiblePhotos.map((photo) => <li key={photo.key} className="w-[140px]">
                <Cutout width={112} src={photo.previewUrl} alt={photo.name} label={photo.previewUrl ? undefined : photo.name} rotate={-2} />
                {photo.draft?.title ? <p className="mt-3 break-words text-[14px]">{photo.draft.title}</p> : null}
                <p className="mn mt-3 text-[8.5px] leading-relaxed tracking-[0.08em] text-mute-2">{photo.dismissed ? 'FILING DISCARDED · COPY RETAINED' : photo.captureConflict ? 'FILING NEEDS REVIEW' : photo.filed ? `LOT ${String(photo.filed.lotNo).padStart(4, '0')} · FILED` : photo.itemId ? (photo.originalBackup ? 'ORIGINAL BACKED UP · COPY HERE' : 'JPEG UPLOADED · ORIGINAL HERE') : photo.syncStarted ? 'WAITING FOR CONFIRMATION' : photo.readyToFile ? 'READY TO FILE' : photo.draft ? 'DRAFT ON DEVICE' : 'SAVED ON DEVICE'}</p>
                {photo.filed && photo.prepared?.converted ? <p className="mt-2 text-[12px] text-mute-2">{photo.originalBackup ? 'Camera original backed up. Local copy retained.' : 'Camera original still needs backup.'}</p> : null}
                {photo.captureConflict && !photo.dismissed ? <button type="button" className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline" onClick={() => { setReviewError(''); setReviewing(photo) }}>REVIEW FILING</button> : null}
                {!photo.dismissed && !photo.captureConflict && !photo.syncStarted && !photo.itemId ? <button type="button" className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline" onClick={() => { void (async () => {
                  try {
                    if (!ownerId || localOwner() !== ownerId) return
                    await saveCaptureDraft(ownerId, photo.key, photo.draft ?? emptyCaptureDraft, false, photo.draftRevision ?? 0, photo.preview)
                    setEditing({ ...photo, draft: photo.draft ?? emptyCaptureDraft, readyToFile: false, draftRevision: (photo.draftRevision ?? 0) + 1 })
                  } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open this draft.') }
                })() }}>CUT & FILE</button> : null}
                <a href={photo.downloadUrl} download={photo.name} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline">SAVE ORIGINAL</a>
                {photo.originalBackup && photo.itemId ? <a href={`/api/capture/${photo.itemId}/original`} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline">DOWNLOAD BACKUP</a> : null}
                {photo.draftUrl ? <a href={photo.draftUrl} download={`${photo.name}.json`} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline">SAVE DETAILS</a> : null}
                {photo.filed ? <a href={`/o/${photo.filed.lotNo}`} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.08em] underline">OPEN FILED OBJECT</a> : null}
              </li>)}
            </ul>
            {pending ? <button type="button" disabled={syncing || saving} onClick={() => { void actions.current.sync() }} className="mn mt-6 min-h-11 border-b border-hair-strong px-3 text-[10px] tracking-[0.12em] disabled:opacity-60">{syncing ? 'CHECKING CONNECTION…' : 'UPLOAD WHEN CONNECTED'}</button> : null}
            <p className="mt-8 text-[13px] leading-relaxed text-mute-2">Crop and file photographs here without a connection. Prepare your archive online to browse it here too. Device storage can be cleared by the browser; upload or save a copy when you can.</p>
            <div className="mt-4 flex flex-wrap justify-between gap-3">
              <a href="/accession" className="mn inline-flex min-h-11 items-center text-[9px] tracking-[0.1em] underline">OPEN THE ONLINE APP</a>
              <button type="button" className="mn min-h-11 text-[9px] tracking-[0.1em] text-mute-2" onClick={() => { lockLocalArchive(); setMessage('Local archive locked. Sign in online to reopen it.') }}>LOCK THIS DEVICE</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<OfflineApp />)
