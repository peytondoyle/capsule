'use server'

import { getCurrentUser } from '@/server/auth'
import { createObjectShare } from '@/server/shares'

export async function createShareAction(objectId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('not signed in')
  const share = await createObjectShare(user.id, objectId)
  return `/s/${share.token}`
}
