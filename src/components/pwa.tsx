'use client'

import { useEffect } from 'react'

/**
 * Registers the worker, asks for storage persistence, and nothing else.
 *
 * The badge lives in <UnfiledBadge>, rendered by the surfaces that actually
 * know the count — this component claimed to keep it honest while the layout
 * mounted it with no count at all, so it only ever cleared.
 */
export function Pwa() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' })
    }
    // The IndexedDB offline queue is the sole copy of a capture until its
    // upload records, and iOS evicts IDB under pressure — but WebKit exempts
    // persisted storage and explicitly favours Home Screen apps in granting it.
    if (navigator.storage?.persist) void navigator.storage.persist()
  }, [])

  return null
}
