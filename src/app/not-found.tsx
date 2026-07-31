import Link from 'next/link'

export default function NotFound() {
  return (
    <main
      data-surface="ledger"
      className="safe-t safe-b flex min-h-dvh flex-col items-center justify-center bg-bg px-8 text-ink"
    >
      <h1 className="mn text-[10.5px] font-semibold tracking-[0.22em]">CAPSULE</h1>
      <p className="mn mt-3 text-[8.5px] tracking-[0.14em] text-mute-2">NOT IN THE ARCHIVE</p>

      <hr className="my-7 w-24 border-0 border-t border-hair" />

      <p className="max-w-[38ch] text-center text-[13px] leading-relaxed text-mute-1">
        Nothing is filed at this address.
      </p>

      <Link
        href="/timeline"
        className="mn mt-7 rounded-md bg-ink px-4 py-2 text-[9px] font-medium tracking-[0.1em] text-bg"
      >
        BACK TO THE TIMELINE
      </Link>
    </main>
  )
}
