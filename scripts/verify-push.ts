import { asc, eq } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import { pushSubscriptions, users } from '../src/server/db/schema'
import { sendToOwner, subscribe, unsubscribe } from '../src/server/push'
import { check, failures, requireVerificationBranch, resolveOwner } from './verify-db'

requireVerificationBranch()

async function main() {
  const db = getDb()
  const ownerId = resolveOwner(
    process.argv,
    await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)),
  )
  const endpoint = `https://push-probe.invalid/${crypto.randomUUID()}`

  try {
    console.log(`\nverifying against ${ownerId}\n`)
    await subscribe(ownerId, {
      endpoint,
      keys: { p256dh: 'probe-p256dh', auth: 'probe-auth' },
      userAgent: 'Capsule push proof',
    })
    const [created] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
    check('a subscription is recorded', created?.ownerId === ownerId)

    await unsubscribe('user_does_not_exist', endpoint)
    const [stillOwned] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
    check('another owner cannot unsubscribe it', stillOwned?.ownerId === ownerId)

    await sendToOwner(ownerId, { title: 'probe', body: 'probe', url: '/queue' }, async (subscription) => {
      if (subscription.endpoint === endpoint) {
        throw Object.assign(new Error('gone'), { statusCode: 410 })
      }
    })
    const [pruned] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
    check('a 410 prunes the dead subscription', !pruned)
  } finally {
    await unsubscribe(ownerId, endpoint)
  }

  if (failures()) process.exitCode = 1
  else console.log('\nall checks passed')
}

void main()
