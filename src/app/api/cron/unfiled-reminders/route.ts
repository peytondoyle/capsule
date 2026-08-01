import { getDb } from '@/server/db'
import { users } from '@/server/db/schema'
import { sendUnfiledReminder } from '@/server/push'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const owners = await getDb().select({ id: users.id }).from(users)
    await Promise.all(owners.map((owner) => sendUnfiledReminder(owner.id)))
    return Response.json({ ok: true, owners: owners.length })
  } catch (error) {
    console.error('unfiled reminder cron failed', error)
    return new Response('Could not send unfiled reminders', { status: 500 })
  }
}
