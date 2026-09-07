'use client'

import { useEffect, useRef, useState } from 'react'

import { clampPoint, FULL_CROP, isSaneCrop, type CropPoint } from '@/lib/crop-geometry'
import { cropPreview, drawCropPreview } from '@/lib/crop-preview'
import { emptyCaptureDraft, type CaptureDraft } from '@/lib/capture-draft'
import { toUploadable } from '@/lib/heic'
import type { PendingUpload } from '@/lib/offline-queue'

const fields = [
  ['title', 'Title', 250],
  ['kind', 'Kind', 100],
  ['receivedAt', 'Received date', undefined],
  ['place', 'Place', 250],
  ['occasion', 'Occasion', 250],
  ['givenBy', 'Given by', 250],
] as const

const inputClass = 'min-h-11 border-0 border-b border-hair-strong bg-transparent text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-accent'

function parsedTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function validDate(value: string) {
  if (!value) return true
  const parsed = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function OfflineCaptureEditor({ photo, onSave, onClose, faceOnly = false }: {
  photo: PendingUpload
  faceOnly?: boolean
  onSave: (draft: CaptureDraft, ready: boolean, preview?: Blob) => Promise<void>
  onClose: () => void
}) {
  const image = useRef<HTMLImageElement>(null)
  const sourceCanvas = useRef<HTMLCanvasElement>(null)
  const focal35 = useRef<number | undefined>(undefined)
  const savedDraft = photo.draft ?? emptyCaptureDraft
  const [draft, setDraft] = useState<CaptureDraft>(savedDraft)
  const [tagsText, setTagsText] = useState(savedDraft.tags.join(', '))
  const [dragging, setDragging] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [corrected, setCorrected] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft) || tagsText !== savedDraft.tags.join(', ')
  const points = draft.corners

  useEffect(() => {
    let active = true
    let url = ''

    void (async () => {
      const source = new File([photo.bytes], photo.name, { type: photo.type })
      const uploadable = await toUploadable(source)
      if (!active) return
      if (!uploadable.ok) {
        setError(uploadable.reason)
        return
      }
      try {
        const { default: exifr } = await import('exifr')
        const exif = await exifr.parse(uploadable.file, ['FocalLengthIn35mmFormat'])
        const focal = exif?.FocalLengthIn35mmFormat
        focal35.current = typeof focal === 'number' && Number.isFinite(focal) && focal > 0 ? focal : undefined
      } catch { focal35.current = undefined }
      if (!active) return
      url = URL.createObjectURL(uploadable.file)
      if (image.current) image.current.src = url
    })().catch(() => active && setError('Could not prepare this photograph.'))

    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo.bytes, photo.name, photo.type])

  useEffect(() => {
    if (loaded && image.current && sourceCanvas.current) drawCropPreview(sourceCanvas.current, image.current, points)
  }, [loaded, points])

  useEffect(() => {
    if (!loaded || !image.current) return
    let active = true
    let url = ''

    const source = image.current
    const timer = setTimeout(() => { void cropPreview(source, points, focal35.current).then((blob) => {
      if (!active) return
      url = URL.createObjectURL(blob)
      setCorrected(url)
    }, (cause) => {
      if (active) {
        setCorrected('')
        setError(cause instanceof Error ? cause.message : 'Could not make the corrected preview.')
      }
    }) }, 100)

    return () => {
      active = false
      clearTimeout(timer)
      if (url) URL.revokeObjectURL(url)
    }
  }, [loaded, points])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])

  function locate(event: React.PointerEvent) {
    const box = sourceCanvas.current!.getBoundingClientRect()
    return clampPoint({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height })
  }

  function update(index: number, point: CropPoint) {
    setDraft((current) => ({
      ...current,
      corners: (current.corners ?? FULL_CROP).map((item, itemIndex) => itemIndex === index ? point : item),
    }))
  }

  function fieldError(nextDraft: CaptureDraft, nextTags: string[]) {
    if (!validDate(nextDraft.receivedAt)) return 'Use a real received date.'
    if (nextDraft.title.length > 250 || nextDraft.kind.length > 100 || nextDraft.place.length > 250 || nextDraft.occasion.length > 250 || nextDraft.givenBy.length > 250 || nextDraft.story.length > 20000 || nextTags.length > 50 || nextTags.some((tag) => tag.length > 100)) return 'One of these details is too long to save.'
    if (nextDraft.corners && !isSaneCrop(nextDraft.corners)) return 'Move the corners so they outline a real four-sided shape.'
    return ''
  }

  async function save(ready: boolean) {
    if (!image.current) {
      setError('The photograph is still loading.')
      return
    }
    const tags = parsedTags(tagsText)
    const nextDraft = { ...draft, tags }
    const validation = fieldError(nextDraft, tags)
    if (validation) {
      setError(validation)
      return
    }

    setError('')
    setSaving(true)
    try {
      await onSave(nextDraft, ready, await cropPreview(image.current, nextDraft.corners, focal35.current))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this draft.')
    } finally {
      setSaving(false)
    }
  }

  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg px-6 py-6 text-ink">
    <div className="mx-auto max-w-[620px]">
      <nav className="flex min-h-11 items-center justify-between border-b border-hair">
        <button type="button" disabled={saving} onClick={() => { if (!dirty || window.confirm('Leave without saving this draft?')) onClose() }} className="mn min-h-11 px-2 text-[9px] tracking-[.12em] disabled:opacity-50">CLOSE</button>
        <span className="mn text-[9px] tracking-[.16em]">{faceOnly ? 'EDIT PHOTOGRAPH' : 'CUT & FILE'}</span>
        <span className="w-12" />
      </nav>

      {!loaded && !error ? <p role="status" className="mn mt-6 text-[9px] tracking-[.1em] text-mute-2">PREPARING PHOTOGRAPH…</p> : null}
      <div className="relative mt-6 touch-none" onPointerMove={(event) => !saving && dragging !== null && update(dragging, locate(event))} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local Blob URL must be decoded into a canvas offline. */}
        <img ref={image} alt="" className="hidden" onLoad={() => setLoaded(true)} onError={() => setError('This photograph could not be decoded on this device.')} />
        <canvas ref={sourceCanvas} aria-label="Original photograph with crop corners" className="block w-full rounded-[12px]" />
        {loaded && (points ?? FULL_CROP).map((point, index) => <button key={index} type="button" disabled={saving} aria-label={`Crop corner ${index + 1}`} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(index) }} onKeyDown={(event) => {
          const delta = event.key === 'ArrowLeft' ? { x: -0.01, y: 0 } : event.key === 'ArrowRight' ? { x: 0.01, y: 0 } : event.key === 'ArrowUp' ? { x: 0, y: -0.01 } : event.key === 'ArrowDown' ? { x: 0, y: 0.01 } : null
          if (delta) {
            event.preventDefault()
            update(index, clampPoint({ x: point.x + delta.x, y: point.y + delta.y }))
          }
        }} className="absolute size-11 -translate-x-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}><span className="mx-auto block size-3 border-2 border-accent bg-bg" /></button>)}
      </div>

      <button type="button" disabled={saving} onClick={() => setDraft((current) => ({ ...current, corners: null }))} className="mn mt-3 min-h-11 text-[9px] tracking-[.1em] underline disabled:opacity-50">USE FULL PHOTOGRAPH</button>
      {corrected ? <section className="mt-5">
        <p className="mn mb-2 text-[9px] tracking-[.1em] text-mute-2">CORRECTED PREVIEW</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- local Blob URL is the offline corrected preview. */}
        <img src={corrected} alt="Corrected crop preview" className="max-h-80 w-full rounded-[12px] object-contain" />
      </section> : null}

      {!faceOnly ? <div className="mt-6 grid gap-3">
        {fields.map(([field, label, maxLength]) => <label key={field} className="grid gap-1"><span className="mn text-[9px] tracking-[.1em]">{label}</span><input disabled={saving} type={field === 'receivedAt' ? 'date' : 'text'} maxLength={maxLength} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} className={inputClass} /></label>)}
        <label className="grid gap-1"><span className="mn text-[9px] tracking-[.1em]">TAGS</span><input disabled={saving} maxLength={5049} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="Separate with commas" className={inputClass} /></label>
        <label className="grid gap-1"><span className="mn text-[9px] tracking-[.1em]">STORY</span><textarea disabled={saving} maxLength={20000} value={draft.story} onChange={(event) => setDraft((current) => ({ ...current, story: event.target.value }))} className={`${inputClass} min-h-24 py-3 text-[14px]`} /></label>
      </div> : null}

      {error ? <p role="alert" className="mn mt-4 text-[9px] tracking-[.08em] text-accent">{error}</p> : null}
      <div className="mt-6 flex gap-2"><button type="button" disabled={saving || !loaded} onClick={() => void save(false)} className="mn min-h-11 flex-1 border border-hair-strong text-[9px] tracking-[.1em] disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE DRAFT'}</button><button type="button" disabled={saving || !loaded} onClick={() => void save(true)} className="mn min-h-11 flex-1 bg-ink text-[9px] tracking-[.1em] text-bg disabled:opacity-50">{faceOnly ? 'SAVE PHOTO CHANGE' : 'FILE WHEN CONNECTED'}</button></div>
    </div>
  </main>
}
