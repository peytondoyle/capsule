'use client'

import { useEffect } from 'react'

/**
 * Registers the worker and keeps the app badge honest. Mounted once in the
 * root layout; `unfiled` rides in from whichever page rendered last.
 */
export function Pwa({ unfiled = 0 }: { unfiled?: number }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' })
    }
  }, [])

  useEffect(() => {
    // The rust number on the home-screen icon — the design's nag, made literal.
    if ('setAppBadge' in navigator) {
      if (unfiled > 0) void (navigator as Navigator).setAppBadge?.(unfiled)
      else void (navigator as Navigator).clearAppBadge?.()
    }
  }, [unfiled])

  return null
}
