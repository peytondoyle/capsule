'use client'

import { useState, useTransition } from 'react'

import { createShareAction } from '@/server/actions/shares'

/** Mint (or fetch) the object's share link and put it on the clipboard. */
export function ShareButton({ objectId }: { objectId: string }) {
  const [busy, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          const path = await createShareAction(objectId)
          const url = `${location.origin}${path}`
          try {
            if (navigator.share) await navigator.share({ url })
            else await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2400)
          } catch {
            // Dismissed the share sheet — nothing to clean up.
          }
        })
      }
      className="mn text-[9px] tracking-[0.1em] text-mute-2 underline decoration-hair-strong underline-offset-4 disabled:opacity-45"
    >
      {copied ? 'LINK COPIED' : 'SHARE'}
    </button>
  )
}
