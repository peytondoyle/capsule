import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'

import { deleteUser, upsertUser } from '@/server/users'

export async function POST(req: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>

  try {
    event = await verifyWebhook(req)
  } catch {
    // Unsigned or replayed — never touch the database.
    return new Response('invalid signature', { status: 400 })
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      const user = event.data
      const primaryEmail = user.email_addresses.find(
        (address) => address.id === user.primary_email_address_id,
      )
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ')

      await upsertUser({
        id: user.id,
        email: primaryEmail?.email_address ?? null,
        displayName: name || user.username || null,
        avatarUrl: user.image_url ?? null,
      })
      break
    }

    case 'user.deleted': {
      if (event.data.id) await deleteUser(event.data.id)
      break
    }
  }

  return new Response('ok')
}
