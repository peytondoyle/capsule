import { useEffect, useMemo, useRef, useState } from 'react'

import { Cutout } from '@/design/cutout'
import { CUT_STYLES, SILHOUETTES, type CutStyle, type Silhouette } from '@/design/silhouettes'
import { ObjectFaces, type ObjectFace } from './object-faces'
import { OfflineCaptureEditor } from './offline-capture-editor'
import { OfflineFaceControls, OfflinePhotoChanges } from './offline-photo-changes'
import { listFaceChanges, saveCaptureDraft, type PendingUpload } from '@/lib/offline-queue'
import { drainCaptures } from '@/lib/capture-sync'
import { OfflineIndex, indexLabels } from './offline-index'
import { archiveIndex, indexObjectIds } from '@/lib/offline/indexes'
import { offlineHref, readOfflineLocation, type OfflineLocation } from '@/lib/offline/navigation'
import { OfflineObjectEditor } from './offline-object-editor'
import { OfflineConflictReview } from './offline-conflict-review'
import { OfflineNameEditor } from './offline-name-editor'
import { OfflineTaxonomyDelete } from './offline-taxonomy-delete'
import { reviewTaxonomyDeletion, taxonomyDeletionBase, taxonomyDeletions } from '@/lib/offline/taxonomy-delete'
import { reviewTaxonomyName, taxonomyEdits, taxonomyKind, type TaxonomyEntity } from '@/lib/offline/taxonomy'
import { objectEdits, projectArchive, reviewObject } from '@/lib/offline/edits'
import { linkedNames, searchArchive, textValue, type ArchiveRecord } from '@/lib/offline/library'
import { mediaKey } from '@/lib/offline/media'
import { prepareArchive, type PreparationProgress } from '@/lib/offline/prepare'
import { localOwner, offlineShellReady } from '@/lib/offline/session'
import { listOperations, mediaAvailability, readLibrary, readMedia, readPreparation, resolveObjectChanges, resolveTaxonomyName, resolveTaxonomyDeletion, saveObjectChanges, saveTaxonomyName, saveTaxonomyDeletion, type LocalArchive, type OutboxEntry } from '@/lib/offline/store'
import { syncArchive } from '@/lib/offline/sync'
import type { SyncSnapshot } from '@/lib/offline/types'

const buttonClass = 'mn min-h-11 px-2 text-[9px] tracking-[0.1em] underline disabled:opacity-50'
const controlClass = 'min-h-11 border-b border-hair-strong bg-transparent px-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent'
const shape = (record: ArchiveRecord) => (typeof record.silhouette === 'string' && Object.hasOwn(SILHOUETTES, record.silhouette) ? record.silhouette : 'card') as Silhouette
const cut = (record: ArchiveRecord) => (typeof record.cutStyle === 'string' && Object.hasOwn(CUT_STYLES, record.cutStyle) ? record.cutStyle : 'edge') as CutStyle
const numberValue = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

function LocalPhoto({ ownerId, face, record, photos }: { ownerId: string; photos: PendingUpload[]; face?: SyncSnapshot['faces'][number]; record: ArchiveRecord }) {
  const [picture, setPicture] = useState<{ ownerId: string; url: string }>()
  const preview = photos.findLast(photo => !photo.dismissed && photo.faceReceipt?.faceId === face?.id && photo.faceReceipt?.cutoutUrl === face?.cutoutUrl)?.preview
  const source = textValue(face?.thumbUrl) || textValue(face?.cutoutUrl) || textValue(face?.originalUrl)
  useEffect(() => {
    let active = true, url = ''
    if (source) void readMedia(ownerId, mediaKey(source)).then((media) => {
      if (!active || localOwner() !== ownerId || (!media && !preview)) return
      url = URL.createObjectURL(media?.bytes ?? preview!)
      setPicture({ ownerId, url })
    }).catch(() => {})
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [ownerId, source, preview])
  const url = picture?.ownerId === ownerId ? picture.url : undefined
  return <Cutout width={112} silhouette={shape(record)} cut={cut(record)} rotate={numberValue(record.rotationDeg, 0)} aspect={numberValue(face?.width, 115) / Math.max(1, numberValue(face?.height, 100))} src={url} alt={textValue(record.title)} label={url ? undefined : 'Photograph unavailable'} />
}

function LocalObject({ ownerId, snapshot, archive, operations, record, editing, photos, onPhotoEdit, onEdit, onBack, onChanged }: { ownerId: string; snapshot: SyncSnapshot; archive: LocalArchive; operations: OutboxEntry[]; record: ArchiveRecord; editing: boolean; photos: PendingUpload[]; onPhotoEdit: (photo: PendingUpload) => void; onEdit: (record?: ArchiveRecord) => void; onBack: () => void; onChanged: () => Promise<void> }) {
  const [media, setMedia] = useState<{ ownerId: string; faces: ObjectFace[]; localPreview: boolean; pendingPreview: boolean; originals: Array<{ id: string; url: string; name: string; role: string }> }>()
  const names = linkedNames(snapshot, record)
  const edits = objectEdits(operations, record.id)
  const review = reviewObject(archive, operations, record.id)
  useEffect(() => {
    let active = true
    const urls: string[] = []
    void (async () => {
      const rows = snapshot.faces.filter((face) => face.objectId === record.id).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
      const originals: Array<{ id: string; url: string; name: string; role: string }> = []
      const faces: ObjectFace[] = []
      let localPreview = false
      for (const face of rows) {
        const role = face.role === 'verso' || face.role === 'detail' ? face.role : 'recto'
        let picture: string | null = null
        for (const source of [face.cutoutUrl, face.thumbUrl, face.originalUrl]) {
          if (typeof source !== 'string') continue
          const saved = await readMedia(ownerId, mediaKey(source))
          if (!active || localOwner() !== ownerId) return
          if (saved) { picture = URL.createObjectURL(saved.bytes); urls.push(picture); break }
        }
        const retained = photos.findLast(photo => !photo.dismissed && photo.faceReceipt?.faceId === face.id && photo.faceReceipt?.cutoutUrl === face.cutoutUrl)
        if (!picture && retained?.preview) { picture = URL.createObjectURL(retained.preview); urls.push(picture); localPreview = true }
        faces.push({ id: face.id, role, cutoutUrl: picture, width: numberValue(face.width, 115), height: numberValue(face.height, 100) })
        if (typeof face.originalUrl === 'string') {
          const original = await readMedia(ownerId, mediaKey(face.originalUrl)) ?? (retained ? { bytes: retained.bytes, name: retained.name } : undefined)
          if (!active || localOwner() !== ownerId) return
          if (original) {
            const url = URL.createObjectURL(original.bytes)
            urls.push(url)
            originals.push({ id: face.id, url, name: original.name, role: role === 'recto' ? 'front' : role === 'verso' ? 'back' : 'detail' })
          }
        }
      }
      let pendingPreview = false
      for (const photo of photos) {
        const target = photo.faceTarget
        if (!target || target.objectId !== record.id || photo.dismissed || photo.itemId || photo.faceConflict || !photo.readyToFile) continue
        if (target.action === 'save' && !photo.preview) continue
        const index = faces.findIndex(face => face.id === target.faceId)
        if (index >= 0) faces.splice(index, 1)
        pendingPreview = true
        if (target.action === 'delete') continue
        const bitmap = await createImageBitmap(photo.preview!)
        const width = bitmap.width, height = bitmap.height
        bitmap.close()
        if (!active || localOwner() !== ownerId) return
        const picture = URL.createObjectURL(photo.preview!)
        urls.push(picture)
        faces.push({ id: target.faceId, role: target.role, cutoutUrl: picture, width, height })
      }
      if (active && localOwner() === ownerId) setMedia({ ownerId, faces, originals, localPreview, pendingPreview })
    })().catch(() => {})
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [ownerId, snapshot, record.id, photos])
  const visible = media?.ownerId === ownerId ? media : undefined
  if (editing) return <OfflineObjectEditor record={record} snapshot={snapshot} onClose={() => onEdit()} onSave={async (expected, changes) => {
    if (localOwner() !== ownerId) throw new Error('This local account is locked. Your text is still here.')
    await saveObjectChanges(ownerId, record.id, expected, changes)
    await onChanged()
  }} />
  return <section className="mt-6">
    <button type="button" className={buttonClass} onClick={onBack}>BACK TO ARCHIVE</button>
    <p className="mn mt-5 text-[9px] tracking-[0.14em] text-mute-2">LOT {String(record.lotNo).padStart(4, '0')}</p>
    <h1 className="mt-2 text-[27px] font-semibold tracking-tight">{textValue(record.title) || 'Untitled'}</h1>
    {edits.length ? <p className="mn mt-3 text-[9px] tracking-[0.1em] text-accent">{review ? 'CHANGES NEED REVIEW' : 'CHANGES SAVED ON DEVICE'}</p> : null}
    {!review ? <button type="button" className={`${buttonClass} mt-3`} onClick={() => onEdit(record)}>EDIT DETAILS</button> : null}
    {edits.length ? <a href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ ...record, people: names.people, place: names.place, occasion: names.occasion, tags: names.tags, collections: names.collections }, null, 2))}`} download={`capsule-lot-${record.lotNo}-local.json`} className={buttonClass}>SAVE LOCAL DETAILS</a> : null}
    {review ? <OfflineConflictReview key={review.token} review={review} snapshot={snapshot} onResolve={async (choices, discard) => {
      if (localOwner() !== ownerId) throw new Error('Sign in to this account to review its changes.')
      await resolveObjectChanges(ownerId, record.id, review.token, choices, discard)
      await onChanged()
    }} /> : null}
    <div className="my-10">{visible?.faces.length ? <ObjectFaces faces={visible.faces} silhouette={shape(record)} cut={cut(record)} rotate={numberValue(record.rotationDeg, 0)} title={textValue(record.title)} width={220} /> : <p className="text-[13px] text-mute-2">Photograph unavailable on this device.</p>}</div>
    {visible?.pendingPreview ? <p className="mn text-[9px] text-accent">LOCAL PHOTO CHANGES · WAITING TO SYNC</p> : visible?.localPreview ? <p className="mn text-[9px] text-mute-2">LOCAL CROP PREVIEW · REFRESH ARCHIVE TO SAVE THE FINAL IMAGE</p> : null}
    <OfflineFaceControls ownerId={ownerId} objectId={record.id} faces={snapshot.faces.filter(face => face.objectId === record.id)} photos={photos.filter(photo => photo.faceTarget?.objectId === record.id)} onEdit={onPhotoEdit} onChanged={onChanged} />
    <dl>{[['Kind', textValue(record.kind).replaceAll('_', ' ')], ['Received', textValue(record.receivedAt) || 'Unknown'], ['People', names.people.join(', ')], ['Place', names.place], ['Occasion', names.occasion], ['Tags', names.tags.join(', ')], ['Collections', names.collections.join(', ')], ['Still have it', record.retention === 'digital_only' ? 'Only here now' : 'Yes']].map(([label, value]) => value ? <div key={label} className="grid grid-cols-[100px_1fr] gap-3 border-t border-hair py-3"><dt className="mn text-[9px] uppercase tracking-[0.1em] text-mute-2">{label}</dt><dd className="break-words text-[14px]">{value}</dd></div> : null)}</dl>
    {record.story ? <p className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{textValue(record.story)}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3">{visible?.originals.map((original, index) => <a key={original.id} href={original.url} download={original.name} className={buttonClass}>SAVE {original.role.toUpperCase()} ORIGINAL{visible.originals.length > 1 ? ` ${index + 1}` : ''}</a>)}</div>
  </section>
}

export function OfflineLibrary({ ownerId, onClose }: { ownerId: string; onClose: () => void }) {
  const [route] = useState(() => readOfflineLocation(new URL(location.href)))
  const [indexRole, setIndexRole] = useState<OfflineLocation['role']>(route.role)
  const [archive, setArchive] = useState<LocalArchive>()
  const [operations, setOperations] = useState<OutboxEntry[]>([])
  const [photos, setPhotos] = useState<PendingUpload[]>([])
  const [photoEditing, setPhotoEditing] = useState<PendingUpload>()
  const [syncing, setSyncing] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [status, setStatus] = useState('Reading the archive saved on this device…')
  const [query, setQuery] = useState(route.query)
  const [filter, setFilter] = useState(route.filter ?? '')
  const [order, setOrder] = useState<'newest' | 'oldest' | 'lot'>(route.order ?? 'newest')
  const [limit, setLimit] = useState(50)
  const [selectedId, setSelectedId] = useState<string | undefined>(route.objectId)
  const [editRecord, setEditRecord] = useState<ArchiveRecord>()
  const [nameEditing, setNameEditing] = useState<{ entity: TaxonomyEntity; id: string; name: string; review: ReturnType<typeof reviewTaxonomyName> }>()
  const [deleting, setDeleting] = useState<{ entity: TaxonomyEntity; id: string; base: NonNullable<ReturnType<typeof taxonomyDeletionBase>>; review: ReturnType<typeof reviewTaxonomyDeletion> }>()
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState<PreparationProgress>()
  const controller = useRef<AbortController | null>(null)
  const actions = useRef({ refresh: async () => {}, sync: async () => {} })

  useEffect(() => {
    let active = true
    async function refresh() {
      const [library, pending, facePhotos] = await Promise.all([readLibrary(ownerId), readPreparation(ownerId), listFaceChanges(ownerId, true)])
      if (!active || localOwner() !== ownerId) return
      const saved = library.archive
      setArchive(saved)
      setOperations(library.operations)
      setPhotos(facePhotos)
      const snapshot = pending?.snapshot ?? saved?.snapshot
      const availability = snapshot ? await mediaAvailability(ownerId, snapshot) : null
      if (!active || localOwner() !== ownerId) return
      if (pending && availability) {
        setProgress({ ...availability, objects: pending.snapshot.records.length })
        setStatus('Preparation is unfinished. Resume when connected; your previous saved archive is still available.')
      } else if (saved && availability) {
        setProgress(undefined)
        setStatus(saved.preparedAt && availability.saved === availability.total ? `${saved.snapshot.records.length} ${saved.snapshot.records.length === 1 ? 'object' : 'objects'} available offline. Saved ${new Date(saved.preparedAt).toLocaleString()}.` : 'Some archive photographs are missing on this device. Prepare again when connected.')
      } else { setProgress(undefined); setStatus('Prepare while connected to keep every object, photograph, and original available here.') }
    }
    actions.current.refresh = refresh
    void refresh().catch(() => { if (active) setStatus('Local archive storage could not be opened. Keep your originals and try again.') })
    const returned = () => {
      if (controller.current) return
      void refresh().catch(() => {})
      if (navigator.onLine) void actions.current.sync()
    }
    const visible = () => { if (document.visibilityState === 'visible') returned() }
    window.addEventListener('focus', returned)
    window.addEventListener('online', returned)
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; controller.current?.abort(); window.removeEventListener('focus', returned); window.removeEventListener('online', returned); document.removeEventListener('visibilitychange', visible) }
  }, [ownerId])

  async function sync() {
    if (controller.current || localOwner() !== ownerId) return
    const abort = new AbortController()
    controller.current = abort
    try {
      const [edits, faces] = await Promise.all([listOperations(ownerId), listFaceChanges(ownerId)])
      if ((!edits.length && !faces.length) || abort.signal.aborted) return
      setSyncing(true)
      const photoErrors: string[] = []
      const photoResult = await drainCaptures(ownerId, { kind: 'faces', isActiveOwner: () => localOwner() === ownerId && !abort.signal.aborted, onProgress: progress => { if (progress.error) photoErrors.push(progress.error) } })
      if (abort.signal.aborted || localOwner() !== ownerId) return
      if (photoResult === 'locked') { setEditStatus('Photo sync paused. Sign in to this account online to continue.'); return }
      const result = await syncArchive(ownerId, { signal: abort.signal, isActiveOwner: () => localOwner() === ownerId })
      if (abort.signal.aborted || localOwner() !== ownerId) return
      await actions.current.refresh()
      const remaining = (await listFaceChanges(ownerId)).filter(photo => !photo.itemId)
      setEditStatus(photoErrors.length ? photoErrors[0]! : photoResult === 'busy' ? 'Another tab is syncing photographs. Try again when it finishes.' : remaining.length ? `${remaining.length} photo changes remain on this device. Finish drafts or review conflicts below.` : result.status === 'synced' ? 'Your saved edits are synced.' : result.status === 'conflict' || result.status === 'rejected' ? 'Some changes need review. Your local details are still saved.' : result.status === 'busy' ? 'Another tab is syncing this archive.' : 'Sync paused. Sign in to this account online to continue.')
    } catch {
      if (!abort.signal.aborted && localOwner() === ownerId) {
        await actions.current.refresh().catch(() => {})
        setEditStatus('Sync could not finish. Your edits are still saved on this device.')
      }
    } finally { controller.current = null; setSyncing(false) }
  }
  useEffect(() => { actions.current.sync = sync })

  async function changed() {
    await actions.current.refresh()
    setEditStatus('Changes saved on this device.')
  }

  async function editPhoto(photo: PendingUpload) {
    if (localOwner() !== ownerId) throw new Error('This local account is locked.')
    const revision = photo.draftRevision ?? 0
    await saveCaptureDraft(ownerId, photo.key, photo.draft!, false, revision, photo.preview)
    if (localOwner() === ownerId) setPhotoEditing({ ...photo, readyToFile: false, draftRevision: revision + 1 })
  }

  async function prepare() {
    if (controller.current || localOwner() !== ownerId) return
    const abort = new AbortController()
    controller.current = abort
    setPreparing(true)
    setStatus('Preparing the offline app and reading your archive…')
    try {
      if (!await offlineShellReady(true)) throw new Error('The offline app is not ready yet. Keep Capsule open online and try again.')
      if (abort.signal.aborted || localOwner() !== ownerId) return
      await navigator.storage?.persist?.().catch(() => false)
      const result = await prepareArchive(ownerId, { signal: abort.signal, isActiveOwner: () => localOwner() === ownerId, onProgress: setProgress })
      if (localOwner() !== ownerId) return
      await actions.current.refresh()
      if (result !== 'ready') setStatus(result === 'busy' ? 'Another tab is preparing this archive. Return here to refresh.' : 'Preparation paused. Sign in to this account online to continue.')
    } catch (error) {
      if (localOwner() === ownerId) setStatus(abort.signal.aborted ? 'Preparation paused. Saved files will be reused when you resume.' : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'This device ran out of storage. Your previous archive and pending captures are safe; free some space and resume.' : error instanceof Error ? error.message : 'Preparation stopped. Resume when connected.')
    } finally { controller.current = null; setPreparing(false) }
  }

  const visible = archive?.ownerId === ownerId ? archive : undefined
  const snapshot = useMemo(() => visible ? projectArchive(visible.snapshot, operations) : undefined, [visible, operations])
  const directory = route.section === 'objects' ? undefined : route.section
  const entry = directory && route.entry ? snapshot?.[directory].find(record => record.id === route.entry) : undefined
  const directoryEntity = directory ? ({ people: 'person', places: 'place', occasions: 'occasion' } as const)[directory] : undefined
  const entryStats = useMemo(() => snapshot && directory && route.entry ? archiveIndex(snapshot, directory).find(value => value.record.id === route.entry) : undefined, [snapshot, directory, route.entry])
  const records = useMemo(() => {
    if (!snapshot) return []
    const ids = directory && route.entry ? indexObjectIds(snapshot, directory, route.entry, directory === 'people' ? indexRole : undefined) : undefined
    return searchArchive(ids ? { ...snapshot, records: snapshot.records.filter(record => ids.has(record.id)) } : snapshot, query, filter, order)
  }, [snapshot, query, filter, order, directory, route.entry, indexRole])
  const selected = editRecord ?? snapshot?.records.find(row => selectedId ? row.id === selectedId : route.lot !== undefined && Number(row.lotNo) === route.lot)
  function openObject(id: string) {
    history.replaceState(null, '', offlineHref({ section: route.section, entry: route.entry, query, role: indexRole, filter, order, objectId: id }))
    setSelectedId(id)
  }
  function returnToList() { location.assign(offlineHref({ section: route.section, entry: route.entry, query, role: indexRole, filter, order })) }
  function openName(entity: TaxonomyEntity, id: string) {
    if (!visible || !snapshot) return
    const review = reviewTaxonomyName(visible, operations, entity, id)
    const record = review?.local ?? snapshot[taxonomyKind[entity]].find(row => row.id === id)
    if (record) setNameEditing({ entity, id, name: textValue(record.name), review })
  }
  const reviews = [...new Set(operations.filter((entry) => entry.response?.outcome === 'conflict' || entry.response?.outcome === 'rejected').flatMap((entry) => entry.mutation.type === 'object.patch' ? [entry.mutation.patch.id] : []))]
  const nameReviews = [...new Map(operations.flatMap(operation => {
    const mutation = operation.mutation
    return (operation.response?.outcome === 'conflict' || operation.response?.outcome === 'rejected') && mutation.type === 'taxonomy.upsert' && mutation.entity !== 'tag' && mutation.id ? [[`${mutation.entity}:${mutation.id}`, { entity: mutation.entity, id: mutation.id }] as const] : []
  })).values()]
  const pendingPhotos = photos.filter(photo => !photo.itemId && !photo.dismissed)
  const deletions = taxonomyDeletions(operations)
  if (deleting) return <OfflineTaxonomyDelete entity={deleting.entity} id={deleting.id} base={deleting.base} current={deleting.review?.base} review={!!deleting.review} refreshed={deleting.review?.refreshed ?? true} canRetry={!deleting.review || !!deleting.review.current && deleting.review.entry.response?.outcome === 'conflict'} linkLabel={link => {
    const [id, role] = link.split(':'), object = visible?.snapshot.records.find(row => row.id === id)
    return `${object ? `Lot ${String(object.lotNo).padStart(4, '0')} · ${textValue(object.title)}` : id}${role ? ` · ${role.replaceAll('_', ' ')}` : ''}`
  }} onClose={() => setDeleting(undefined)} onRemove={async () => {
    if (localOwner() !== ownerId) throw new Error('Sign in to this account to remove its entries.')
    if (deleting.review) await resolveTaxonomyDeletion(ownerId, deleting.review.entry.operationId, deleting.review.token, true)
    else await saveTaxonomyDeletion(ownerId, deleting.entity, deleting.id, JSON.stringify(deleting.base))
    await changed()
  }} onKeep={async () => {
    if (localOwner() !== ownerId) throw new Error('Sign in to this account to review its changes.')
    if (deleting.review) await resolveTaxonomyDeletion(ownerId, deleting.review.entry.operationId, deleting.review.token, false)
    await changed()
  }} />
  if (nameEditing) return <OfflineNameEditor entity={nameEditing.entity} id={nameEditing.id} initialName={nameEditing.name} review={nameEditing.review ? { archiveName: nameEditing.review.remote ? textValue(nameEditing.review.remote.name) : null, rejected: nameEditing.review.rejected, nameTaken: nameEditing.review.reason === 'name_taken' } : undefined} onClose={() => setNameEditing(undefined)} onSave={async name => {
    if (localOwner() !== ownerId) throw new Error('Sign in to this account to rename its entries.')
    if (nameEditing.review) await resolveTaxonomyName(ownerId, nameEditing.entity, nameEditing.id, nameEditing.review.token, name)
    else await saveTaxonomyName(ownerId, nameEditing.entity, nameEditing.id, nameEditing.name, name)
    await changed()
  }} onDiscard={async () => {
    if (localOwner() !== ownerId) throw new Error('Sign in to this account to review its changes.')
    if (nameEditing.review) await resolveTaxonomyName(ownerId, nameEditing.entity, nameEditing.id, nameEditing.review.token, null)
    await changed()
  }} />
  if (photoEditing) return <OfflineCaptureEditor key={photoEditing.key} photo={photoEditing} faceOnly onClose={() => setPhotoEditing(undefined)} onSave={async (draft, ready, preview) => {
    if (localOwner() !== ownerId) throw new Error('This local account is locked. Your original remains saved.')
    await saveCaptureDraft(ownerId, photoEditing.key, draft, ready, photoEditing.draftRevision ?? 0, preview)
    setPhotoEditing(undefined)
    await changed()
  }} />
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink"><div className="mx-auto max-w-[900px] px-6 pb-10">
    <nav className="flex min-h-14 items-center justify-between border-b border-hair"><button type="button" className={buttonClass} disabled={!!editRecord} onClick={onClose}>CAPTURE & DRAFTS</button><span className="mn text-[9px] tracking-[0.14em] text-mute-2">ARCHIVE ON THIS DEVICE</span></nav>
    <nav aria-label="Saved archive sections" className="flex flex-wrap gap-x-3 border-b border-hair">{(['objects', 'people', 'places', 'occasions'] as const).map(section => <button key={section} type="button" className={`${buttonClass} ${route.section === section ? 'font-semibold text-accent' : 'text-mute-2'}`} aria-current={route.section === section ? 'page' : undefined} disabled={!!editRecord} onClick={() => location.assign(offlineHref({ section }))}>{section === 'objects' ? 'OBJECTS' : indexLabels[section].toUpperCase()}</button>)}</nav>
    {operations.length || pendingPhotos.length ? <div className="mt-4 border-b border-hair pb-3"><p className="mn text-[9px] tracking-[0.1em]">{operations.length + pendingPhotos.length} SAVED CHANGES ON DEVICE</p><button type="button" disabled={syncing || preparing} className={buttonClass} onClick={() => { void sync() }}>{syncing ? 'SYNCING…' : 'SYNC SAVED EDITS'}</button>{reviews.map((id) => <button key={id} type="button" disabled={!!editRecord} className={buttonClass} onClick={() => openObject(id)}>REVIEW LOT {String(snapshot?.records.find((record) => record.id === id)?.lotNo ?? '—')}</button>)}{nameReviews.map(({ entity, id }) => <button key={`${entity}:${id}`} type="button" disabled={!!editRecord} className={`${buttonClass} max-w-full break-words text-left`} onClick={() => openName(entity, id)}>REVIEW NAME · {textValue(snapshot?.[taxonomyKind[entity]].find(row => row.id === id)?.name) || entity.toUpperCase()}</button>)}</div> : null}
    {deletions.map(operation => {
      const mutation = operation.mutation
      if (mutation.type !== 'taxonomy.delete') return null
      const review = visible ? reviewTaxonomyDeletion(visible, operations, operation.operationId) : null
      return <div key={operation.operationId} className="mt-3 border-b border-hair pb-2"><p className="break-words text-[13px]">{textValue(operation.baseRecord?.name) || mutation.entity} · {review ? 'Removal needs review' : 'Removal saved on device; waiting for sync'}</p>{review ? <button type="button" disabled={!!editRecord} className={buttonClass} onClick={() => setDeleting({ entity: mutation.entity, id: mutation.id, base: mutation.base, review })}>REVIEW REMOVAL</button> : null}<a className={`${buttonClass} inline-flex items-center`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ entity: mutation.entity, id: mutation.id, ...mutation.base }, null, 2))}`} download={`capsule-${mutation.id}-removal.json`}>SAVE ENTRY AND LINKS</a></div>
    })}
    {editStatus ? <p role="status" className="mt-3 text-[13px] text-mute-2">{editStatus}</p> : null}
    {selected && visible && snapshot ? <LocalObject key={selected.id} ownerId={ownerId} snapshot={snapshot} archive={visible} operations={operations} record={selected} editing={!!editRecord} photos={photos} onPhotoEdit={setPhotoEditing} onEdit={setEditRecord} onBack={returnToList} onChanged={changed} /> : <>
      {directory && route.entry ? <header className="mt-6">
        <a className={`${buttonClass} inline-flex items-center`} href={offlineHref({ section: directory })}>BACK TO {indexLabels[directory].toUpperCase()}</a>
        <h1 className="mt-4 break-words text-[27px] font-semibold tracking-tight">{entry ? textValue(entry.name) : snapshot ? 'Not in the saved archive' : indexLabels[directory]}</h1>
        {entry ? <>
          <p className="mn mt-2 text-[9px] tracking-[0.1em] text-mute-2">{entryStats?.objectCount ?? 0} LINKED {(entryStats?.objectCount ?? 0) === 1 ? 'OBJECT' : 'OBJECTS'}{entry.localOnly ? ' · SAVED ON DEVICE' : ''}</p>
          {directory === 'people' && entry.note ? <p className="mt-4 max-w-prose whitespace-pre-wrap break-words text-[14px] leading-relaxed">{textValue(entry.note)}</p> : null}
          {directory === 'places' && entry.kind ? <p className="mt-3 text-[14px]">{textValue(entry.kind).replaceAll('_', ' ')}</p> : null}
          {directoryEntity ? entry.localOnly ? <p className="mt-3 text-[13px] text-mute-2">Sync this new entry before renaming it.</p> : <>
            {taxonomyEdits(operations, directoryEntity, entry.id).length ? <p className="mn mt-3 text-[9px] tracking-[0.1em] text-accent">NAME SAVED ON DEVICE</p> : null}
            <button type="button" className={`${buttonClass} mt-2`} onClick={() => openName(directoryEntity, entry.id)}>{nameReviews.some(review => review.entity === directoryEntity && review.id === entry.id) ? 'REVIEW NAME' : 'RENAME'}</button>
            <button type="button" className={`${buttonClass} mt-2`} disabled={taxonomyEdits(operations, directoryEntity, entry.id).length > 0} onClick={() => { const base = taxonomyDeletionBase(snapshot!, directoryEntity, entry.id); if (base) setDeleting({ entity: directoryEntity, id: entry.id, base, review: null }) }}>REMOVE ENTRY</button>
            {taxonomyEdits(operations, directoryEntity, entry.id).length ? <p className="mt-2 text-[13px] text-mute-2">Sync or review the saved rename before removing this entry.</p> : null}
          </> : null}
        </> : snapshot ? <p className="mt-3 text-[14px] text-mute-2">It may have been removed or not yet saved here. Refresh the archive while connected, or return to the index.</p> : null}
      </header> : !directory ? <h1 className="mt-8 text-[27px] font-semibold tracking-tight">Your archive, here.</h1> : null}
      {(route.objectId || route.lot) && visible && !selected ? <p role="status" className="mt-5 text-[14px] text-mute-2">This object is not in the saved archive. Refresh while connected to check for newer objects.</p> : null}
      {!snapshot && directory && !route.entry ? <h1 className="mt-8 text-[27px] font-semibold tracking-tight">{indexLabels[directory]}</h1> : null}
      <p role="status" className="mt-3 text-[13px] leading-relaxed text-mute-2">{status}</p>
      {progress ? <p className="mn mt-2 text-[9px] tracking-[0.08em]">{progress.saved} / {progress.total} FILES · {progress.objects} OBJECTS · {(progress.bytes / 1024 / 1024).toFixed(1)} MB</p> : null}
      <div className="mt-3 flex gap-3"><button type="button" disabled={preparing || syncing} className={buttonClass} onClick={() => { void prepare() }}>{preparing ? 'PREPARING…' : progress ? 'RESUME / REFRESH ARCHIVE' : visible ? 'REFRESH SAVED ARCHIVE' : 'PREPARE FULL ARCHIVE'}</button>{preparing ? <button type="button" className={buttonClass} onClick={() => controller.current?.abort()}>PAUSE</button> : null}</div>
      {snapshot && directory && !route.entry ? <OfflineIndex snapshot={snapshot} kind={directory} initialQuery={route.query} /> : visible ? <>
        {directory === 'people' && entry ? <label className="mt-6 grid max-w-[260px] gap-1"><span className="mn text-[9px] tracking-[0.1em]">RELATIONSHIP</span><select className={controlClass} value={indexRole ?? ''} onChange={event => { const role = event.target.value as OfflineLocation['role']; setIndexRole(role || undefined); setLimit(50); history.replaceState(null, '', offlineHref({ section: directory, entry: entry.id, role, query, filter, order })) }}><option value="">All relationships</option><option value="given_by">Given by · {entryStats?.roles?.given_by ?? 0}</option><option value="depicted">Pictured · {entryStats?.roles?.depicted ?? 0}</option><option value="mentioned">Mentioned · {entryStats?.roles?.mentioned ?? 0}</option></select></label> : null}
        <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_180px_150px]"><label className="grid gap-1"><span className="mn text-[9px] tracking-[0.1em]">SEARCH</span><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50) }} placeholder="Object, lot, person, place, story…" className={controlClass} /></label><label className="grid gap-1"><span className="mn text-[9px] tracking-[0.1em]">FILTER</span><select className={controlClass} value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(50) }}><option value="">All objects</option>{([['person', 'People', snapshot!.people], ['place', 'Places', snapshot!.places], ['occasion', 'Occasions', snapshot!.occasions], ['tag', 'Tags', snapshot!.tags], ['collection', 'Collections', snapshot!.collections]] as const).map(([kind, label, rows]) => <optgroup key={kind} label={label}>{rows.map((row) => <option key={row.id} value={`${kind}:${row.id}`}>{textValue(row.name)}</option>)}</optgroup>)}</select></label><label className="grid gap-1"><span className="mn text-[9px] tracking-[0.1em]">ORDER</span><select className={controlClass} value={order} onChange={(event) => setOrder(event.target.value as typeof order)}><option value="newest">Newest received</option><option value="oldest">Oldest received</option><option value="lot">Lot number</option></select></label></div>
        <p className="mn mt-5 border-b border-hair pb-3 text-[9px] tracking-[0.1em]">{records.length} {records.length === 1 ? 'OBJECT' : 'OBJECTS'}{query || filter ? ' FOUND' : ''}</p>
        <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">{records.slice(0, limit).map((record) => <li key={record.id}><button type="button" className="block min-h-11 w-full text-left focus-visible:outline-2 focus-visible:outline-accent" onClick={() => openObject(record.id)}><LocalPhoto key={`${record.id}:${visible.refreshedAt}`} ownerId={ownerId} photos={photos} record={record} face={visible.snapshot.faces.find((face) => face.objectId === record.id && face.role === 'recto') ?? visible.snapshot.faces.find((face) => face.objectId === record.id)} /><span className="mn mt-4 block text-[8px] tracking-[0.12em] text-mute-2">LOT {String(record.lotNo).padStart(4, '0')}</span><span className="mt-1 block break-words text-[14px]">{textValue(record.title) || 'Untitled'}</span>{pendingPhotos.some(photo => photo.faceTarget?.objectId === record.id) ? <span className="mn mt-2 block text-[8px] text-accent">PHOTO CHANGE SAVED ON DEVICE</span> : null}</button></li>)}</ul>
        {!records.length ? <p className="mt-6 text-[14px]">{query || filter || indexRole ? 'No objects match these filters.' : directory && route.entry ? 'No objects are linked here yet. Add a link while editing an object’s details.' : 'Your saved archive is empty.'}</p> : null}
        {records.length > limit ? <button type="button" className={`${buttonClass} mt-8`} onClick={() => setLimit((value) => value + 50)}>SHOW MORE · {records.length - limit} REMAINING</button> : null}
      </> : null}
      <p className="mt-9 text-[12px] leading-relaxed text-mute-2">Edits stay on this device until sync is confirmed. Refresh online for newer archive photographs. Map and the other archive layouts are still being added.</p>
    </>}
    {!editRecord ? <OfflinePhotoChanges ownerId={ownerId} photos={photos} snapshot={snapshot} onEdit={editPhoto} onChanged={changed} /> : null}
  </div></main>
}
