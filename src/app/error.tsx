'use client'

/**
 * The Ledger-idiom error boundary. Until this existed, any rejected Server
 * Action or render error replaced the whole document with Next's generic
 * "couldn't load" page — destroying whatever the user had typed along the way.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
      data-surface="ledger"
      className="safe-t safe-b flex min-h-dvh flex-col items-center justify-center bg-bg px-8 text-ink"
    >
      <h1 className="mn text-[10.5px] font-semibold tracking-[0.22em]">CAPSULE</h1>
      <p className="mn mt-3 text-[8.5px] tracking-[0.14em] text-mute-2">SOMETHING WENT WRONG</p>

      <hr className="my-7 w-24 border-0 border-t border-hair" />

      <p className="max-w-[40ch] text-center text-[13px] leading-relaxed text-mute-1">
        The archive itself is fine — this screen failed to load. Nothing you filed
        has been lost.
      </p>
      {error.digest ? (
        <p className="mn mt-3 text-[8.5px] tracking-[0.1em] text-mute-3">REF {error.digest}</p>
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="mn mt-7 rounded-md bg-ink px-4 py-2 text-[9px] font-medium tracking-[0.1em] text-bg"
      >
        TRY AGAIN
      </button>
    </main>
  )
}
