import { useEffect, useState } from 'react'

import { faceBaseline, faceLabels, type FaceRole, type FaceTarget } from '@/lib/face-draft'
import { mediaKey } from '@/lib/offline/media'
import { localOwner } from '@/lib/offline/session'
import { readMedia } from '@/lib/offline/store'
import { dismissFaceDraft, enqueueFace, resolveFaceConflict, type PendingUpload } from '@/lib/offline-queue'
import type { SyncSnapshot } from '@/lib/offline/types'

const buttonClass = 'mn inline-flex min-h-11 items-center px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'
type Face = SyncSnapshot['faces'][number]

export function OfflineFaceControls({ ownerId, objectId, faces, photos, onEdit, onChanged }: {
  ownerId: string; objectId: string; faces: Face[]; photos: PendingUpload[]
  onEdit: (photo: PendingUpload) => void; onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = photos.filter(photo => !photo.itemId && !photo.dismissed)
  async function queue(role: FaceRole, face?: Face, file?: File, remove = false) {
    setBusy(true); setError('')
    try {
      if (localOwner() !== ownerId) throw new Error('Sign in to this account to change its photographs.')
      if (!file) {
        const retained = photos.findLast(photo => !photo.dismissed && photo.faceReceipt?.faceId === face?.id && typeof face?.originalUrl === 'string' && photo.faceReceipt?.originalUrl === face.originalUrl)
        const cached = typeof face?.originalUrl === 'string' ? await readMedia(ownerId, mediaKey(face.originalUrl)) : undefined
        const original = cached ?? (retained ? { bytes: retained.bytes, name: retained.name } : undefined)
        if (!original && !remove) throw new Error('Save the original on this device first. Refresh the archive while connected, or choose a replacement photograph.')
        file = new File(original ? [original.bytes] : [], original?.name ?? 'removed-photograph', { type: original?.bytes.type })
      }
      if (localOwner() !== ownerId) throw new Error('This local account is locked.')
      const target: FaceTarget = { operationId: crypto.randomUUID(), objectId, faceId: face?.id ?? crypto.randomUUID(), role, action: remove ? 'delete' : 'save', base: face ? faceBaseline(face) : null }
      const photo = await enqueueFace(ownerId, file, target)
      await onChanged()
      if (!remove && localOwner() === ownerId) onEdit(photo)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The photo could not be saved. Keep its original and try again.') }
    finally { setBusy(false) }
  }
  function picker(role: FaceRole, face?: Face) {
    const disabled = busy || pending.some(photo => photo.faceTarget?.faceId === face?.id || (role !== 'detail' && photo.faceTarget?.role === role))
    return <label className={`${buttonClass} focus-within:outline-2 focus-within:outline-accent ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>{face ? 'REPLACE' : `ADD ${faceLabels[role].toUpperCase()}`}<input type="file" accept="image/*,.heic,.heif" disabled={disabled} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void queue(role, face, file) }} /></label>
  }
  return <section className="mt-6 border-t border-hair pt-3" aria-label="Edit photographs">
    <h2 className="mn text-[10px] tracking-[0.12em]">PHOTOGRAPHS</h2>
    {pending.length ? <p className="mt-2 text-[13px] text-mute-2">Ready photo changes appear in the viewer. Unfinished drafts and conflicts remain below for review.</p> : null}
    {faces.map((face, index) => {
      const role = face.role === 'verso' || face.role === 'detail' ? face.role : 'recto'
      const disabled = busy || pending.some(photo => photo.faceTarget?.faceId === face.id || (role !== 'detail' && photo.faceTarget?.role === role))
      return <div key={face.id} className="mt-2 flex flex-wrap items-center gap-1 border-b border-hair"><span className="mn mr-2 text-[9px] uppercase">{faceLabels[role]}{role === 'detail' ? ` ${index + 1}` : ''}</span>{picker(role, face)}<button type="button" className={buttonClass} disabled={disabled} onClick={() => void queue(role, face)}>RECROP</button><button type="button" className={buttonClass} disabled={disabled} onClick={() => { if (window.confirm(`Remove this ${faceLabels[role].toLowerCase()} photograph from the object when connected?`)) void queue(role, face, undefined, true) }}>REMOVE</button></div>
    })}
    <div className="mt-2 flex flex-wrap">{!faces.some(face => face.role === 'recto') ? picker('recto') : null}{!faces.some(face => face.role === 'verso') ? picker('verso') : null}{picker('detail')}</div>
    {error ? <p role="alert" className="mt-2 text-[13px] text-accent">{error}</p> : null}
  </section>
}

function PhotoChange({ ownerId, photo, title, onEdit, onChanged }: { ownerId: string; photo: PendingUpload; title: string; onEdit: (photo: PendingUpload) => Promise<void>; onChanged: () => Promise<void> }) {
  const [media, setMedia] = useState<{ key: string; original: string; preview: string; current: string }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const target = photo.faceTarget!
  const conflict = photo.faceConflict
  useEffect(() => {
    let active = true
    const urls: string[] = []
    const url = (blob?: Blob) => { if (!blob?.size) return ''; const value = URL.createObjectURL(blob); urls.push(value); return value }
    const original = url(photo.bytes), preview = url(photo.preview)
    void (async () => {
      let current = ''
      for (const source of [conflict?.current?.cutoutUrl, conflict?.current?.thumbUrl]) {
        if (typeof source !== 'string') continue
        const saved = await readMedia(ownerId, mediaKey(source))
        if (!active || localOwner() !== ownerId) return
        if (saved) { current = url(saved.bytes); break }
      }
      if (active && localOwner() === ownerId) setMedia({ key: photo.key, original, preview, current })
    })().catch(() => { if (active && localOwner() === ownerId) setMedia({ key: photo.key, original, preview, current: '' }) })
    return () => { active = false; urls.forEach(value => URL.revokeObjectURL(value)) }
  }, [ownerId, photo.key, photo.bytes, photo.preview, conflict])
  async function act(run: () => Promise<void>) {
    setBusy(true); setError('')
    try {
      if (localOwner() !== ownerId) throw new Error('Sign in to this account to review its changes.')
      await run(); await onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your choice could not be saved. Try again.') }
    finally { setBusy(false) }
  }
  const visible = media?.key === photo.key ? media : undefined
  const token = JSON.stringify({ target, conflict })
  return <article className="mt-4 border-t border-hair py-3">
    <h3 className="text-[15px] font-semibold">{title} · {faceLabels[target.role]}</h3>
    <p className="mn mt-2 text-[9px] tracking-[0.08em]">{photo.dismissed ? 'DISCARDED CHANGE · ORIGINAL RETAINED' : photo.itemId ? 'SYNCED · LOCAL COPY RETAINED' : conflict ? 'NEEDS REVIEW' : photo.syncStarted ? 'SYNC UNCONFIRMED · RETRY SAVED CHANGE' : photo.readyToFile ? 'SAVED ON DEVICE · WAITING TO SYNC' : 'UNFINISHED PHOTO DRAFT'}</p>
    {target.action === 'delete' ? <p className="mt-2 text-[13px]">{photo.itemId ? 'Photograph removed from the object.' : 'Remove this photograph when connected.'}</p> : visible?.preview ? <figure className="mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- durable local crop preview. */}
      <img src={visible.preview} alt={`${faceLabels[target.role]} local crop`} className="max-h-64 max-w-full object-contain" /><figcaption className="mn mt-2 text-[9px]">LOCAL PREVIEW</figcaption>
    </figure> : <p className="mt-2 text-[13px] text-mute-2">Open the draft to prepare a crop preview.</p>}
    {conflict && !photo.dismissed ? <div className="mt-3">
      <p className="text-[13px]">{conflict.objectDeleted ? 'This object was deleted elsewhere. Save your photograph and crop before discarding this change.' : conflict.sourceChanged ? 'The source photograph changed elsewhere. Keeping your photograph will upload your saved original again.' : conflict.current ? 'This photograph changed elsewhere. Choose which version to keep.' : 'This photograph was removed elsewhere. Keeping your version will add it again.'}</p>
      {conflict.current ? visible?.current ? <figure className="mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-scoped archive bytes stored locally. */}
        <img src={visible.current} alt="Current archive photograph" className="max-h-64 max-w-full object-contain" /><figcaption className="mn mt-2 text-[9px]">ARCHIVE VERSION</figcaption>
      </figure> : <p className="mt-2 text-[13px] text-mute-2">The current archive photograph is not saved here. Refresh the saved archive while connected to compare it.</p> : null}
      {!conflict.objectDeleted ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => resolveFaceConflict(ownerId, photo.key, token, true))}>{target.action === 'delete' ? 'REMOVE ARCHIVE PHOTOGRAPH' : 'KEEP MY PHOTOGRAPH'}</button> : null}
      <button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => resolveFaceConflict(ownerId, photo.key, token, false))}>DISCARD MY CHANGE</button>
    </div> : null}
    <div className="mt-2 flex flex-wrap">
      {!photo.dismissed && !photo.itemId && !photo.syncStarted && !conflict ? <><button type="button" className={buttonClass} disabled={busy || target.action === 'delete'} onClick={() => void act(() => onEdit(photo))}>EDIT PHOTO DRAFT</button><button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => dismissFaceDraft(ownerId, photo.key, photo.draftRevision ?? 0))}>DISCARD CHANGE</button></> : null}
      {visible?.original ? <a className={buttonClass} href={visible.original} download={photo.name}>SAVE ORIGINAL</a> : null}
      {visible?.preview ? <a className={buttonClass} href={visible.preview} download={`capsule-${photo.key}-crop.jpg`}>SAVE PREVIEW</a> : null}
      <a className={buttonClass} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ target, corners: photo.draft?.corners ?? null, conflict, receipt: photo.faceReceipt }, null, 2))}`} download={`capsule-${photo.key}-photo-change.json`}>SAVE CROP DETAILS</a>
    </div>
    {error ? <p role="alert" className="mt-2 text-[13px] text-accent">{error}</p> : null}
  </article>
}

export function OfflinePhotoChanges({ ownerId, photos, snapshot, onEdit, onChanged }: { ownerId: string; photos: PendingUpload[]; snapshot?: SyncSnapshot; onEdit: (photo: PendingUpload) => Promise<void>; onChanged: () => Promise<void> }) {
  const pending = photos.filter(photo => !photo.itemId && !photo.dismissed)
  const retained = photos.filter(photo => photo.itemId || photo.dismissed)
  function entry(photo: PendingUpload) {
    const record = snapshot?.records.find(record => record.id === photo.faceTarget?.objectId)
    return <PhotoChange key={photo.key} ownerId={ownerId} photo={photo} title={record ? String(record.title || `Lot ${record.lotNo}`) : 'Object no longer in this archive'} onEdit={onEdit} onChanged={onChanged} />
  }
  return photos.length ? <section className="mt-6" aria-label="Saved photo changes"><h2 className="mn text-[10px] tracking-[0.12em]">SAVED PHOTO CHANGES</h2>{pending.map(entry)}{retained.length ? <details className="mt-4"><summary className={`${buttonClass} cursor-pointer`}>{retained.length} RETAINED PHOTO {retained.length === 1 ? 'COPY' : 'COPIES'}</summary>{retained.map(entry)}</details> : null}</section> : null
}
