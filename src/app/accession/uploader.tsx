'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'

import { Cutout, MonoLabel, SectionLabel } from '@/design'
import { recordUploadAction, startBatchAction } from '@/server/actions/intake'
import { enqueueUpload, listQueued, removeQueued } from '@/lib/offline-queue'
import { clientIntakePath } from '@/lib/blob-path'

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

export function Uploader({ ownerId }: { ownerId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Queued[]>([])
  const [, startTransition] = useTransition()
  const [batchId, setBatchId] = useState<string | null>(null)

  /**
   * Uploads a picker's worth of files and reports, **by index**, which of them
   * actually reached Blob.
   *
   * By index and not by name: the drain deletes the only copy of an offline
   * capture on the strength of this answer, and names are not unique. An iOS
   * camera capture through the picker is called `image.jpg` every single time,
   * so a name-keyed answer lets one success authorise deleting a different
   * photograph that failed.
   */
  async function handleFiles(
    files: FileList | null,
    /** These bytes already have an IndexedDB row; do not park a second one. */
    fromQueue = false,
  ): Promise<Set<number>> {
    const landed = new Set<number>()
    if (!files?.length) return landed

    // Snapshot before the first await. `files` is the input's *live* FileList,
    // and the onChange handler clears `event.target.value` the moment this
    // function yields — which it does on `startBatchAction` for the very first
    // pick of a session. Reading it afterwards found an empty list, so the
    // first "+ ADD PHOTOGRAPHS" of every session silently uploaded nothing and
    // the second one worked.
    const picked = Array.from(files)

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
        return landed
      }
    }

    const queued: Queued[] = picked.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      status: 'reading',
    }))
    setItems((current) => [...current, ...queued])

    await Promise.all(
      picked.map(async (file, i) => {
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
          // The path is the client's to propose and the route's to refuse:
          // @vercel/blob puts the *client's* pathname into the issued token and
          // discards whatever onBeforeGenerateToken returns, so asking for the
          // wrong prefix here does not get quietly corrected — it 400s.
          const blob = await upload(clientIntakePath(ownerId, file.name), file, {
            access: 'private',
            handleUploadUrl: '/api/blob/upload',
            contentType: file.type || undefined,
          })

          const itemId = await recordUploadAction(batch!, blob.url, exif ?? undefined)
          landed.add(i)
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
            // Unless they are already parked: a drain that loses connectivity
            // mid-flight would otherwise write a second row for the same photo
            // under a fresh key, and both would upload on the next visit.
            if (!fromQueue) await enqueueUpload(file, exif?.taken)
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
    return landed
  }

  // Drain anything parked by an offline session. Runs once per mount, and the
  // ref survives StrictMode's deliberate double-invoke — without it both passes
  // read the same rows before either deletes any, and every parked photograph
  // uploads twice under two batches.
  const drained = useRef(false)
  useEffect(() => {
    if (drained.current || !navigator.onLine) return
    drained.current = true
    void (async () => {
      const queued = await listQueued()
      if (queued.length === 0) return

      const list = new DataTransfer()
      for (const item of queued) {
        list.items.add(new File([item.bytes], item.name, { type: item.type }))
      }
      const landed = await handleFiles(list.files, true)

      // Only forget bytes that actually reached Blob, matched by position
      // rather than by name — IndexedDB is the sole copy of an offline capture
      // until the upload records, handleFiles never throws (it reports failure
      // in component state), and every iOS camera capture is called image.jpg.
      for (const [i, item] of queued.entries()) {
        if (landed.has(i)) await removeQueued(item.key)
      }
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

      {/* Upload progress and failures were both inserted into the DOM silently.
          The visible count is the same string, so this only says it out loud. */}
      <p aria-live="polite" className="sr-only">
        {items.length > 0
          ? `${done} of ${items.length} uploaded${
              failed.length ? `, ${failed.length} failed` : ''
            }`
          : ''}
      </p>

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
