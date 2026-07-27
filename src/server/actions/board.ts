'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentUser } from '@/server/auth'
import { dropOnCluster, scatterBoard, tidyBoard } from '@/server/board'
import { moveObject } from '@/server/objects'

async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) throw new Error('not signed in')
  return user.id
}

/** Drag end. No revalidate — the client already shows the truth it created. */
export async function moveObjectAction(objectId: string, x: number, y: number, z?: number) {
  const ownerId = await requireOwner()
  await moveObject(ownerId, objectId, { x, y, z })
}

export async function dropOnClusterAction(objectId: string, clusterId: string) {
  const ownerId = await requireOwner()
  const result = await dropOnCluster(ownerId, objectId, clusterId)
  revalidatePath('/board')
  return result
}

export async function tidyBoardAction() {
  const ownerId = await requireOwner()
  await tidyBoard(ownerId)
  revalidatePath('/board')
}

export async function scatterBoardAction() {
  const ownerId = await requireOwner()
  await scatterBoard(ownerId)
  revalidatePath('/board')
}
