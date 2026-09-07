'use client'

import { useEffect, useState } from 'react'
import { localOwner, offlineShellReady, watchLocalOwner } from '@/lib/offline/session'

export function OfflineAccess({ ownerId }: { ownerId: string }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let mounted = true
    async function check() {
      const prepared = await offlineShellReady(true).catch(() => false)
      if (mounted) setReady(prepared && localOwner() === ownerId)
    }
    const stop = watchLocalOwner(() => { void check() })
    navigator.serviceWorker?.addEventListener('controllerchange', check)
    window.addEventListener('focus', check)
    void check()
    return () => {
      mounted = false
      stop()
      navigator.serviceWorker?.removeEventListener('controllerchange', check)
      window.removeEventListener('focus', check)
    }
  }, [ownerId])
  return (
    <div className="mt-6 border-t border-hair pt-4 text-[13px] leading-relaxed text-mute-2">
      <p role="status">{ready ? 'Offline capture is ready on this device.' : 'Keep Capsule open online to prepare offline capture.'}</p>
      {ready ? <a href="/offline.html" className="mn inline-flex min-h-11 items-center text-[9px] tracking-[0.1em] underline">OPEN OFFLINE CAPTURE</a> : null}
      {ready ? <a href="/offline.html?view=archive" className="mn ml-4 inline-flex min-h-11 items-center text-[9px] tracking-[0.1em] underline">PREPARE FULL ARCHIVE</a> : null}
    </div>
  )
}
