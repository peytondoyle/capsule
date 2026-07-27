'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'

import { Cutout, MonoLabel, SectionLabel } from '@/design'
import { recordUploadAction, startBatchAction } from '@/server/actions/intake'
import { enqueueUpload, listQueued, removeQueued } from '@/lib/offline-queue'

type Queued = {
  key: string
  name: string
  status: 'reading' | 'uploading' | 'done' | 'failed' | 'queued'
  previewUrl?: string
  taken?: string
  error?: string
}

/** EXIF gives a date and often a place for free, before any model runs. */
async function readExif(file: File) {
  try {
    const exifr = (await import('exifr')).default
    const data = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'],
    })
    if (!data) return null
    const taken: Date | undefined = data.DateTimeOriginal ?? data.CreateDate
    return {
      taken: taken ? new Date(taken).toISOString().slice(0, 10) : undefined,
      lat: typeof data.latitude === 'number' ? data.latitude : undefined,
      lng: typeof data.longitude === 'number' ? data.longitude : undefined,
    }
  } catch {
    // A photo with no EXIF is completely normal — scanned paper has none.
    return null
  }
}

export function Uploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Queued[]>([])
  const [, startTransition] = useTransition()
  const [batchId, setBatchId] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return

    let batch = batchId
    if (!batch) {
      try {
        batch = await startBatchAction('files')
        setBatchId(batch)
      } catch (error) {
        // Without this the whole picker looks like it did nothing at all.
        setItems((current) => [
          ...current,
          {
            key: `batch-${Date.now()}`,
            name: 'batch',
            status: 'failed',
            error: error instanceof Error ? error.message : 'could not start a batch',
          },
        ])
        return
      }
    }

    const queued: Queued[] = Array.from(files).map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      status: 'reading',
    }))
    setItems((current) => [...current, ...queued])

    await Promise.all(
      Array.from(files).map(async (file, i) => {
        const key = queued[i]!.key
        const patch = (next: Partial<Queued>) =>
          setItems((current) =>
            current.map((item) => (item.key === key ? { ...item, ...next } : item)),
          )

        const exif = await readExif(file)
        patch({ status: 'uploading', taken: exif?.taken, previewUrl: URL.createObjectURL(file) })

        try {
          // Straight to Blob: the bytes never touch a function, which is the
          // only way a 12 MB HEIC gets through at all.
          // Must match the store the token belongs to. capsule-originals is
          // private, and a mismatch fails silently — the PUT is simply never
          // issued and the item sits on "uploading" forever.
          const blob = await upload(file.name, file, {
            access: 'private',
            handleUploadUrl: '/api/blob/upload',
            contentType: file.type || undefined,
          })

          const itemId = await recordUploadAction(batch!, blob.url, exif ?? undefined)
          patch({ status: 'done' })

          // Kick the pipeline without blocking the picker: full-frame derive,
          // then extraction (501 when no key is configured — that is fine).
          void fetch('/api/derive', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId }),
          })
            .then((res) =>
              res.ok
                ? fetch('/api/extract', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ itemId }),
                  })
                : null,
            )
            .catch(() => {})
        } catch (error) {
          if (!navigator.onLine) {
            // No signal is not a failure — the basement case is the whole
            // reason the queue exists. Park the bytes; drain on next visit.
            await enqueueUpload(file, exif?.taken)
            patch({ status: 'queued' })
          } else {
            patch({
              status: 'failed',
              error: error instanceof Error ? error.message : 'upload failed',
            })
          }
        }
      }),
    )

    startTransition(() => router.refresh())
  }

  // Drain anything parked by an offline session.
  useEffect(() => {
    if (!navigator.onLine) return
    void (async () => {
      const queued = await listQueued()
      if (queued.length === 0) return
      const files = queued.map(
        (item) => new File([item.bytes], item.name, { type: item.type }),
      )
      const list = new DataTransfer()
      for (const file of files) list.items.add(file)
      await handleFiles(list.files)
      for (const item of queued) await removeQueued(item.key)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drain once on mount
  }, [])

  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'failed')

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        // `capture` opens the camera directly on a phone, which is the whole
        // point — most objects get photographed, not picked from a library.
        className="sr-only"
        onChange={(event) => {
          void handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mn h-11 flex-1 rounded-[11px] bg-ink text-[10px] font-medium tracking-[0.14em] text-bg"
        >
          + ADD PHOTOGRAPHS
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <SectionLabel>This batch</SectionLabel>
            <MonoLabel>
              {done} of {items.length} uploaded
            </MonoLabel>
          </div>

          <ul className="mt-4 flex flex-wrap gap-6">
            {items.map((item) => (
              <li key={item.key} className="w-[124px]">
                <Cutout
                  width={112}
                  silhouette="card"
                  cut="edge"
                  rotate={-2}
                  src={item.previewUrl}
                  alt={item.name}
                  label={item.previewUrl ? undefined : 'reading…'}
                  state={item.status === 'done' ? 'idle' : 'pending'}
                />
                <div className="mn mt-3 truncate text-[8.5px] tracking-[0.06em] uppercase text-mute-2">
                  {item.status === 'failed' ? (
                    <span className="text-accent">failed</span>
                  ) : item.status === 'queued' ? (
                    <span className="text-accent">waiting for signal</span>
                  ) : item.status === 'done' ? (
                    (item.taken ?? 'no date in exif')
                  ) : (
                    item.status
                  )}
                </div>
              </li>
            ))}
          </ul>

          {failed.length > 0 ? (
            <p className="mn mt-4 text-[9.5px] leading-relaxed tracking-[0.06em] text-accent">
              {failed[0]!.error?.toUpperCase()}
            </p>
          ) : null}

          {done > 0 ? (
            <a
              href="/queue"
              className="mn mt-8 inline-flex h-11 items-center justify-center rounded-[11px] border border-hair-strong px-5 text-[10px] tracking-[0.14em]"
            >
              FILE THEM · {done} WAITING
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
