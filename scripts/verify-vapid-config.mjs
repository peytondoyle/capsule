import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/server/push.ts', import.meta.url), 'utf8')
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code
const ownerId = 'vapid-test-owner'
const row = { endpoint: 'https://push.invalid/test', p256dh: 'synthetic-p256dh', auth: 'synthetic-auth' }
const payload = { title: 'Test', body: 'Synthetic message', url: '/queue' }
const keys = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'synthetic-public', VAPID_PRIVATE_KEY: 'synthetic-private' }
const fallback = 'https://capsule-omega-ruby.vercel.app'

function load(env, rows = [row]) {
  const calls = []
  const table = { ownerId: 'owner-column' }
  const forbidden = () => assert.fail('Unexpected database mutation or reminder call')
  const db = {
    insert: forbidden,
    delete: forbidden,
    update: forbidden,
    select() {
      return { from(value) {
        assert.equal(value, table)
        return { where(condition) {
          assert.deepEqual(condition, ['owner-column', ownerId])
          return Promise.resolve(rows)
        } }
      } }
    },
  }
  const dependencies = {
    'server-only': {},
    'drizzle-orm': { eq: (column, value) => [column, value], and: forbidden },
    './db': { getDb: () => db },
    './db/schema': { pushSubscriptions: table },
    './objects': { countUnfiled: forbidden },
    'web-push': { sendNotification: async (...args) => { calls.push(JSON.parse(JSON.stringify(args))) } },
  }
  const sandboxModule = { exports: {} }
  vm.runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports, process: { env },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return { send: () => sandboxModule.exports.sendToOwner(ownerId, payload), calls }
}

function assertCall(calls, subject) {
  assert.deepEqual(calls, [[
    { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    JSON.stringify(payload),
    { vapidDetails: { subject, publicKey: keys.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: keys.VAPID_PRIVATE_KEY } },
  ]])
}

for (const subject of ['https://contact.invalid', 'mailto:push@example.invalid', undefined, '']) {
  const fixture = load({ ...keys, VAPID_SUBJECT: subject })
  await fixture.send()
  assertCall(fixture.calls, subject || fallback)
  console.log(`PASS subject ${subject === undefined ? 'unset' : JSON.stringify(subject)}`)
}

for (const key of Object.keys(keys)) {
  for (const value of [undefined, '']) {
    const fixture = load({ ...keys, [key]: value })
    await assert.rejects(fixture.send(), { message: 'VAPID keys are not configured' })
    assert.deepEqual(fixture.calls, [])
    console.log(`PASS ${key} ${value === undefined ? 'unset' : 'empty'} prevents transport`)
  }
}

const empty = load({}, [])
await empty.send()
assert.deepEqual(empty.calls, [])
console.log('PASS env-less import and empty subscriptions stay lazy')

const env = {}
const lazy = load(env)
assert.deepEqual(lazy.calls, [])
Object.assign(env, keys, { VAPID_SUBJECT: 'https://late-config.invalid' })
await lazy.send()
assertCall(lazy.calls, env.VAPID_SUBJECT)
console.log('PASS configuration is read at send time')
console.log('All 10 VAPID configuration checks passed; transport and database were mocked.')
