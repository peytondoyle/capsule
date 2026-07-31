'use client'

import { useState, useTransition } from 'react'

import { createShareAction } from '@/server/actions/shares'

/** Mint (or fetch) the object's share link and put it on the clipboard. */
export function ShareButton({ objectId }: { objectId: string }) {
  const [busy, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [href, setHref] = useState<string | null>(null)

  /** Mints the share link once, ahead of the tap. */
  const prime = async () => {
    if (href) return
    try {
      setHref(`${location.origin}${await createShareAction(objectId)}`)
    } catch {
      // Leave it null; the click path will try again and can report.
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      // Mint the link on hover/focus rather than on the tap. navigator.share
      // requires transient activation, which a click grants and an `await`
      // spends — so calling it after the Server Action round-trip meant the
      // sheet silently never opened, and the bare catch swallowed the reason.
      // With the link already in hand the share call is synchronous inside the
      // handler and the activation still counts.
      onPointerEnter={() => void prime()}
      onFocus={() => void prime()}
      onClick={() =>
        startTransition(async () => {
          const url = href ?? `${location.origin}${await createShareAction(objectId)}`
          setHref(url)
          try {
            if (navigator.share) await navigator.share({ url })
            else await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2400)
          } catch (error) {
            // AbortError is the user dismissing the sheet — not a failure.
            // Anything else (NotAllowedError when activation has lapsed, or no
            // share support at all) falls back to the clipboard and says so,
            // rather than appearing to do nothing.
            if ((error as Error)?.name === 'AbortError') return
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2400)
            } catch {
              setFailed(true)
              setTimeout(() => setFailed(false), 2400)
            }
          }
        })
      }
      className="mn text-[9px] tracking-[0.1em] text-mute-2 underline decoration-hair-strong underline-offset-4 disabled:opacity-45"
    >
      {failed ? 'COULD NOT SHARE' : copied ? 'LINK COPIED' : 'SHARE'}
    </button>
  )
}
