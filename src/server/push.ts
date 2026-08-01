import 'server-only'

import { and, eq } from 'drizzle-orm'
import webpush from 'web-push'

import { getDb } from './db'
import { pushSubscriptions } from './db/schema'
import { countUnfiled } from './objects'

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string | null
}

export type PushPayload = {
  title: string
  body: string
  url: string
}

type SendPush = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>

export async function subscribe(ownerId: string, subscription: PushSubscriptionInput) {
  return getDb()
    .insert(pushSubscriptions)
    .values({
      ownerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: subscription.userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        ownerId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: subscription.userAgent,
      },
    })
}

export async function unsubscribe(ownerId: string, endpoint: string) {
  return getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.ownerId, ownerId), eq(pushSubscriptions.endpoint, endpoint)))
}

const sendPush: SendPush = (subscription, payload) => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not configured')
  return webpush.sendNotification(subscription, payload, {
    vapidDetails: {
      subject: 'https://capsule-omega-ruby.vercel.app',
      publicKey,
      privateKey,
    },
  })
}

export async function sendToOwner(ownerId: string, payload: PushPayload, send: SendPush = sendPush) {
  const subscriptions = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerId, ownerId))

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        )
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'statusCode' in error
            ? (error as { statusCode?: number }).statusCode
            : undefined
        if (statusCode === 404 || statusCode === 410) {
          await unsubscribe(ownerId, subscription.endpoint)
          return
        }
        throw error
      }
    }),
  )
}

export async function sendUnfiledReminder(ownerId: string) {
  const count = await countUnfiled(ownerId)
  if (!count) return
  await sendToOwner(ownerId, {
    title: `${count} object${count === 1 ? '' : 's'} still unfiled`,
    body: 'A small thing is still waiting for its story.',
    url: '/queue',
  })
}
