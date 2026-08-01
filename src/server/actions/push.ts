'use server'

import { getCurrentUser } from '@/server/auth'
import { subscribe, unsubscribe, type PushSubscriptionInput } from '@/server/push'

async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) throw new Error('not signed in')
  return user.id
}

export async function subscribePushAction(subscription: PushSubscriptionInput) {
  return subscribe(await requireOwner(), subscription)
}

export async function unsubscribePushAction(endpoint: string) {
  return unsubscribe(await requireOwner(), endpoint)
}
