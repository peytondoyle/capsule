'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

import { localOwner, lockLocalArchive, rememberLocalOwner } from '@/lib/offline/session'

export function Pwa() {
  const { isLoaded, userId } = useAuth()
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' }).catch(() => {})
    }
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    let cancelled = false
    try {
      if (!userId || localOwner() !== userId) lockLocalArchive()
    } catch { return }
    if (!userId) return
    void fetch('/api/offline-session', { cache: 'no-store', headers: { 'x-capsule-owner': userId } })
      .then(async (response) => {
        if (cancelled) return
        if (response.status === 401 || response.status === 409) { lockLocalArchive(); return }
        if (!response.ok) return
        const value = await response.json()
        if (!cancelled && value.ownerId === userId) rememberLocalOwner(userId)
      }).catch(() => {})
    return () => { cancelled = true }
  }, [isLoaded, userId])

  return null
}
