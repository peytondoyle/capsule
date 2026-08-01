'use client'

import { useState } from 'react'

import { subscribePushAction } from '@/server/actions/push'

function applicationServerKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export function PushPermission({ preview = false }: { preview?: boolean }) {
  const [message, setMessage] = useState<string | null>(null)

  async function enable() {
    if (preview) {
      setMessage('Permission is only requested after this tap.')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setMessage('Push is not available in this browser.')
      return
    }
    if (Notification.permission === 'denied') {
      setMessage('Alerts are blocked in this browser.')
      return
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) {
      setMessage('Push is not configured yet.')
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        }))
      const value = subscription.toJSON()
      if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) {
        throw new Error('subscription is incomplete')
      }
      await subscribePushAction({
        endpoint: value.endpoint,
        keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
        userAgent: navigator.userAgent,
      })
      setMessage('Unfiled reminders are on.')
    } catch {
      setMessage('Could not turn on reminders.')
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void enable()}
        className="mn w-full rounded-md px-2 py-1.5 text-left text-[8.5px] tracking-[0.1em] text-mute-2 hover:text-mute-1"
      >
        TURN ON UNFILED REMINDERS
      </button>
      {message ? <p className="mn px-2 text-[8px] leading-relaxed tracking-[0.08em] text-mute-3">{message}</p> : null}
    </div>
  )
}
