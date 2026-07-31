'use client'

import { useEffect } from 'react'

/**
 * The rust number on the home-screen icon — the design's nag, made literal.
 *
 * Rendered by the surfaces that already fetch the unfiled count, because the
 * root layout cannot know it: the layout mounted <Pwa /> with no count, so the
 * badge was permanently zero and the only thing the code ever did was clear it.
 */
export function UnfiledBadge({ count }: { count: number }) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (count > 0) void navigator.setAppBadge?.(count)
    else void navigator.clearAppBadge?.()
  }, [count])

  return null
}
