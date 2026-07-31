import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Offline — Capsule' }

/**
 * The page the service worker serves when a navigation cannot reach the
 * network. Static and unauthenticated by construction — it is cached by the
 * worker at install time, before any session exists, so nothing user-specific
 * can be in it.
 *
 * The one useful promise it can make is the one the offline queue keeps:
 * photographs taken with no signal are parked on the device and upload on the
 * next visit.
 */
export default function OfflinePage() {
  return (
    <main data-surface="ledger" className="safe-t safe-b flex min-h-dvh flex-col items-center justify-center bg-bg px-8 text-ink">
      <h1 className="mn text-[10.5px] font-semibold tracking-[0.22em]">CAPSULE</h1>
      <p className="mn mt-3 text-[8.5px] tracking-[0.14em] text-mute-2">NO SIGNAL</p>

      <hr className="my-7 w-24 border-0 border-t border-hair" />

      <p className="max-w-[38ch] text-center text-[13px] leading-relaxed text-mute-1">
        The archive needs a connection. Anything you photographed while offline is
        saved on this device and will upload the next time the app opens with
        signal.
      </p>
    </main>
  )
}
