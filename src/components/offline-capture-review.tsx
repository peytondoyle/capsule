import type { PendingUpload } from '@/lib/offline-queue'

const buttonClass = 'mn inline-flex min-h-11 items-center text-[9px] tracking-[0.1em] underline disabled:opacity-50'

export function OfflineCaptureReview({ photo, busy, error, onClose, onResolve }: {
  photo: PendingUpload & { downloadUrl: string; previewUrl?: string; draftUrl?: string }
  busy: boolean
  error: string
  onClose: () => void
  onResolve: (copy: boolean) => void
}) {
  const draft = photo.draft!
  return <main data-surface="ledger" className="safe-t safe-b min-h-dvh bg-bg text-ink">
    <div className="mx-auto max-w-[620px] px-6 pb-10">
      <nav className="flex min-h-14 items-center border-b border-hair"><button type="button" className={buttonClass} disabled={busy} onClick={onClose}>BACK TO PHOTOGRAPHS</button></nav>
      <p className="mn mt-8 text-[9px] tracking-[0.12em] text-accent">FILING NEEDS REVIEW</p>
      <h1 className="mt-3 break-words text-[27px] font-semibold tracking-tight">{draft.title || 'Untitled object'}</h1>
      <p className="mt-4 text-[14px] leading-relaxed">This photograph was changed, filed, or skipped in the archive before your filing was confirmed. Your original photograph, crop, and details are saved here.</p>
      <p className="mt-3 text-[14px] leading-relaxed text-mute-2">Check the online archive before creating a separate draft: an object may already exist. A separate draft starts a new object and keeps this saved copy for recovery.</p>
      <a href="/queue" className={`${buttonClass} mt-2`}>CHECK ONLINE QUEUE</a>
      {photo.previewUrl ? <figure className="mt-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- retained local capture preview. */}
        <img src={photo.previewUrl} alt="Your saved photograph and crop" className="max-h-80 max-w-full object-contain" />
        <figcaption className="mn mt-2 text-[9px] tracking-[0.1em]">SAVED ON THIS DEVICE</figcaption>
      </figure> : <p className="mt-5 text-[13px] text-mute-2">Download the original to view this photograph.</p>}
      <dl className="mt-6 grid gap-3 border-t border-hair pt-4">{([
        ['Kind', draft.kind.replaceAll('_', ' ')], ['Received', draft.receivedAt], ['Place', draft.place],
        ['Occasion', draft.occasion], ['Given by', draft.givenBy], ['Tags', draft.tags.join(', ')], ['Story', draft.story],
      ] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="mn text-[9px] uppercase tracking-[0.1em] text-mute-2">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words ${label === 'Received' ? 'mn text-[11px] tracking-[0.08em]' : 'text-[14px]'}`}>{value}</dd></div>)}</dl>
      <div className="mt-5 flex flex-wrap gap-x-6">
        <a href={photo.downloadUrl} download={photo.name} className={buttonClass}>SAVE ORIGINAL</a>
        {photo.draftUrl ? <a href={photo.draftUrl} download={`${photo.name}.json`} className={buttonClass}>SAVE CROP & DETAILS</a> : null}
      </div>
      <div className="mt-6 border-t border-hair pt-4">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => onResolve(true)}>CREATE SEPARATE DRAFT</button>
        <p className="text-[13px] leading-relaxed text-mute-2">Review the copy before filing it. Nothing uploads until you mark that draft ready.</p>
        <button type="button" className={`${buttonClass} mt-4`} disabled={busy} onClick={() => onResolve(false)}>DISCARD MY FILING</button>
        <p className="text-[13px] leading-relaxed text-mute-2">Stop this filing attempt. Your saved photograph and details remain available to download.</p>
      </div>
      {error ? <p role="alert" className="mt-4 text-[13px] text-accent">{error}</p> : null}
    </div>
  </main>
}
