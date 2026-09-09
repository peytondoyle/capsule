'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

import { Cutout, MonoLabel, SectionLabel } from '@/design'
import { drainCaptures, type CaptureProgress } from '@/lib/capture-sync'
import { enqueueUpload, listQueued, listRetainedOriginals, type PendingUpload } from '@/lib/offline-queue'
import { isHeic } from '@/lib/heic'

type Queued = {
  key: string
  name: string
  status: 'saving' | 'unsaved' | CaptureProgress['status']
  previewUrl?: string
  downloadUrl?: string
  originalBackup?: CaptureProgress['originalBackup']
  itemId?: string
  needsOriginalBackup?: boolean
  retainedOriginal?: boolean
  error?: string
}

export function Uploader({ ownerId }: { ownerId: string }) {
  const router = useRouter()
  const { isLoaded, userId } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const active = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    active.current = isLoaded && userId === ownerId ? ownerId : undefined
    return () => { active.current = undefined }
  }, [isLoaded, userId, ownerId])
  const previews = useRef(new Map<string, string>())
  const [items, setItems] = useState<Queued[]>([])
  const [dropping, setDropping] = useState(false)
  const [notice, setNotice] = useState('')
  const [hasLocalDrafts, setHasLocalDrafts] = useState(false)
  const [captureReviews, setCaptureReviews] = useState(0)
  const [, startTransition] = useTransition()
  const draining = useRef(false)
  const drainAgain = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const localItem = useCallback((item: PendingUpload): Queued => {
    let url = previews.current.get(item.key)
    if (!url) {
      url = URL.createObjectURL(item.bytes)
      previews.current.set(item.key, url)
    }
    return {
      key: item.key, name: item.name, status: item.itemId ? 'uploaded' : 'saved',
      previewUrl: isHeic(new File([], item.name, { type: item.type })) ? undefined : url,
      downloadUrl: url, retainedOriginal: !!item.itemId, originalBackup: item.originalBackup, itemId: item.itemId, needsOriginalBackup: !!item.itemId && !!item.prepared?.converted && !item.originalBackup,
    }
  }, [])

  const syncRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    syncRef.current = async () => {
    if (active.current !== ownerId || !navigator.onLine) return
    if (draining.current) { drainAgain.current = true; return }
    draining.current = true
    try {
      do {
        drainAgain.current = false
        const result = await drainCaptures(ownerId, {
          isActiveOwner: () => active.current === ownerId,
          onProgress: (progress) => {
            if (active.current !== ownerId) return
            setItems((current) => current.map((item) => item.key === progress.key ? { ...item, error: undefined, ...progress, needsOriginalBackup: progress.originalBackup ? false : item.needsOriginalBackup } : item))
          },
        })
        if (result === 'locked') setNotice('Photographs are saved on this device. Sign in to this account in a supported browser to upload them.')
        if (result === 'busy') {
          clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => { void syncRef.current() }, 1500)
        }
      } while (drainAgain.current && active.current === ownerId && navigator.onLine)
      const local = await listQueued(ownerId)
      if (active.current === ownerId) {
        setCaptureReviews(local.filter(item => item.captureConflict && !item.dismissed).length)
        setHasLocalDrafts(current => current || local.some(item => !!item.draft && !item.faceTarget))
        startTransition(() => router.refresh())
      }
    } catch {
      if (active.current === ownerId) setNotice('Could not read the local queue. Keep this tab open and try again.')
    } finally {
      draining.current = false
    }
    }
  })

  async function handleFiles(files: FileList | File[] | null) {
    // The picker clears its live FileList as soon as this function yields.
    const picked = Array.from(files ?? [])
    if (!picked.length || active.current !== ownerId) return
    setNotice('')
    for (const file of picked) {
      if (active.current !== ownerId) break
      const temporaryKey = crypto.randomUUID()
      setItems((current) => [...current, { key: temporaryKey, name: file.name, status: 'saving' }])
      try {
        // Preserve raw camera bytes before EXIF parsing, conversion, or any network request.
        const key = await enqueueUpload(ownerId, file)
        if (active.current !== ownerId) break
        const queued = localItem({ key, ownerId, name: file.name, type: file.type, bytes: file, queuedAt: Date.now() })
        setItems((current) => current.map((item) => item.key === temporaryKey ? queued : item))
      } catch {
        setItems((current) => current.map((item) => item.key === temporaryKey ? {
          ...item, status: 'unsaved', error: 'This device could not save the photograph. Keep the original and try again after freeing space.',
        } : item))
      }
    }
    void syncRef.current()
  }

  const handleFilesRef = useRef(handleFiles)
  useEffect(() => { handleFilesRef.current = handleFiles })

  useEffect(() => {
    if (!isLoaded || userId !== ownerId) return
    active.current = ownerId
    let mounted = true
    const urls = previews.current
    void Promise.all([listQueued(ownerId), listRetainedOriginals(ownerId)]).then(([pending, retained]) => {
      if (!mounted || active.current !== ownerId) return
      setHasLocalDrafts([...pending, ...retained].some((item) => !!item.draft && !item.faceTarget))
      setCaptureReviews(pending.filter(item => item.captureConflict && !item.dismissed).length)
      setItems((current) => {
        const known = new Set(current.map((item) => item.key))
        return [...current, ...[...pending, ...retained].filter((item) => !item.draft && !known.has(item.key)).map(localItem)]
      })
      void syncRef.current()
    }).catch(() => { if (mounted) setNotice('This browser cannot open local photo storage. Photographs cannot be saved here yet.') })

    function retry() { if (active.current === ownerId) void syncRef.current() }
    function visible() { if (document.visibilityState === 'visible') retry() }
    function fromTransfer(transfer: DataTransfer | null) {
      return [...(transfer?.files ?? [])].filter((file) => file.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp|avif)$/i.test(file.name))
    }
    function onPaste(event: ClipboardEvent) {
      const files = fromTransfer(event.clipboardData)
      if (files.length) { event.preventDefault(); void handleFilesRef.current(files) }
    }
    function onDragOver(event: DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); setDropping(true) }
    }
    function onDragLeave(event: DragEvent) { if (!event.relatedTarget) setDropping(false) }
    function onDrop(event: DragEvent) {
      setDropping(false)
      const files = fromTransfer(event.dataTransfer)
      if (files.length) { event.preventDefault(); void handleFilesRef.current(files) }
    }
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      mounted = false
      active.current = undefined
      clearTimeout(retryTimer.current)
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      setItems([])
    }
  }, [isLoaded, userId, ownerId, localItem])

  if (!isLoaded || userId !== ownerId) return <p className="text-sm text-mute-2">Sign in to this account to add photographs.</p>
  const uploaded = items.filter((item) => item.status === 'uploaded').length
  const pending = items.filter((item) => item.status === 'saved' || item.status === 'failed' || item.status === 'uploading' || item.needsOriginalBackup).length
  const unsaved = items.filter((item) => item.status === 'unsaved').length

  return (
    <div className="relative">
      {dropping ? <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-bg/85"><span className="mn text-[10px] tracking-[0.18em] text-accent">DROP TO ADD</span></div> : null}
      <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => {
        void handleFiles(event.target.files)
        event.target.value = ''
      }} />
      <button type="button" onClick={() => inputRef.current?.click()} className="mn h-11 w-full rounded-[11px] bg-ink text-[10px] font-medium tracking-[0.14em] text-bg">+ ADD PHOTOGRAPHS</button>
      <p aria-live="polite" className="mt-3 text-[13px] text-mute-2">
        {items.length ? `${uploaded} uploaded · ${pending} saved on this device${unsaved ? ` · ${unsaved} not saved` : ''}` : 'Photographs are saved on this device before uploading.'}
      </p>
      {notice ? <p role="status" className="mt-3 text-[13px] text-accent">{notice}</p> : null}
      {captureReviews ? <p role="status" className="mt-3 text-[13px] text-accent">{captureReviews} {captureReviews === 1 ? 'filing needs' : 'filings need'} review. Your photographs and details are saved on this device.</p> : null}
      {hasLocalDrafts || captureReviews ? <a href="/offline.html" className="mn mt-3 inline-flex min-h-11 items-center text-[9px] tracking-[0.1em] underline">{captureReviews ? 'REVIEW LOCAL FILINGS' : 'OPEN LOCAL DRAFTS & FILED COPIES'}</a> : null}
      {items.length ? <div className="mt-8">
        <div className="flex items-baseline justify-between"><SectionLabel>Photographs</SectionLabel><MonoLabel>{items.length} TOTAL</MonoLabel></div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-8">
          {items.map((item) => <li key={item.key} className="w-[140px]">
            <Cutout width={112} silhouette="card" cut="edge" rotate={-2} src={item.previewUrl} alt={item.name} label={item.previewUrl ? undefined : item.name} state={item.status === 'uploading' || item.status === 'saving' ? 'pending' : 'idle'} />
            <div className="mn mt-3 text-[8.5px] tracking-[0.06em] uppercase text-mute-2">
              {item.status === 'uploaded' ? 'Uploaded' : item.status === 'uploading' ? 'Saved · uploading' : item.status === 'saving' ? 'Saving on device…' : item.status === 'unsaved' ? 'Not saved' : 'Saved on device'}
            </div>
            {item.error ? <p className="mt-2 text-[12px] leading-relaxed text-accent">{item.error}</p> : null}
            {item.retainedOriginal ? <p className="mt-2 text-[12px] text-mute-2">{item.originalBackup ? 'Camera original backed up. Local copy retained.' : 'JPEG uploaded. Camera original still needs backup.'}</p> : null}
            {item.originalBackup && item.itemId ? <a href={`/api/capture/${item.itemId}/original`} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.06em] underline">DOWNLOAD BACKUP</a> : null}
            {item.downloadUrl && (item.status !== 'uploaded' || item.retainedOriginal) ? <a href={item.downloadUrl} download={item.name} className="mn inline-flex min-h-11 items-center text-[8.5px] tracking-[0.06em] underline">SAVE ORIGINAL</a> : null}
          </li>)}
        </ul>
        {pending ? <button type="button" onClick={() => { setNotice(''); void syncRef.current() }} className="mn mt-6 min-h-11 border-b border-hair-strong px-3 text-[10px] tracking-[0.12em]">RETRY UPLOADS</button> : null}
        {uploaded ? <a href="/queue" className="mn mt-6 ml-3 inline-flex min-h-11 items-center border-b border-hair-strong px-3 text-[10px] tracking-[0.12em]">OPEN FILING QUEUE</a> : null}
      </div> : null}
    </div>
  )
}
