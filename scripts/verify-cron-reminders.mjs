import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const sources = Object.fromEntries(['src/server/push.ts', 'src/app/api/cron/unfiled-reminders/route.ts'].map(file => [
  file, transformSync(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
]))
const plain = value => JSON.parse(JSON.stringify(value))
const subscription = (ownerId, suffix = ownerId) => ({ ownerId, endpoint: `https://push.invalid/${suffix}`, p256dh: `${ownerId}-key`, auth: `${ownerId}-auth` })
const message = count => ({ title: `${count} object${count === 1 ? '' : 's'} still unfiled`, body: 'A small thing is still waiting for its story.', url: '/queue' })

function signal() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function load(file, dependencies, env, errors) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(sources[file], {
    module: sandboxModule, exports: sandboxModule.exports, process: { env }, Request, Response,
    console: { error: (...args) => errors.push(args) },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return sandboxModule.exports
}

function fixture({ counts = { one: 1 }, rows = Object.keys(counts).map(owner => subscription(owner)), fail = {}, sendGate, pruneGate, cronEnv = { CRON_SECRET: 'synthetic-cron' } } = {}) {
  const calls = { users: 0, counts: [], queries: [], sends: [], prunes: [], errors: [] }
  let subscriptions = [...rows]
  const pending = []
  const sendStarted = signal(), pruneStarted = signal()
  const track = promise => {
    pending.push(promise)
    promise.catch(() => {})
    return promise
  }
  const users = { id: 'users.id' }
  const table = { ownerId: 'subscriptions.ownerId', endpoint: 'subscriptions.endpoint' }
  const forbidden = () => assert.fail('Unexpected database mutation')
  const db = {
    insert: forbidden, update: forbidden,
    select(projection) {
      return { from(target) {
        if (target === users) {
          assert.deepEqual(plain(projection), { id: users.id })
          calls.users++
          return track(Promise.resolve().then(() => {
            if (fail.users) throw fail.users
            return Object.keys(counts).map(id => ({ id }))
          }))
        }
        assert.equal(target, table)
        assert.equal(projection, undefined)
        return { where(predicate) {
          const owner = predicate[2]
          assert.ok(Object.hasOwn(counts, owner))
          assert.deepEqual(predicate, ['eq', table.ownerId, owner])
          calls.queries.push(owner)
          return track(Promise.resolve().then(() => {
            if (fail.query?.[owner]) throw fail.query[owner]
            return subscriptions.filter(row => row.ownerId === owner)
          }))
        } }
      } }
    },
    delete(target) {
      assert.equal(target, table)
      return { where(predicate) {
        const owner = predicate[1]?.[2], endpoint = predicate[2]?.[2]
        assert.ok(Object.hasOwn(counts, owner))
        assert.deepEqual(predicate, ['and', ['eq', table.ownerId, owner], ['eq', table.endpoint, endpoint]])
        assert.ok(subscriptions.some(row => row.ownerId === owner && row.endpoint === endpoint))
        calls.prunes.push({ owner, endpoint })
        pruneStarted.resolve()
        return track((async () => {
          if (pruneGate) await pruneGate.promise
          if (fail.prune) throw fail.prune
          subscriptions = subscriptions.filter(row => row.ownerId !== owner || row.endpoint !== endpoint)
        })())
      } }
    },
  }
  const env = { ...cronEnv, NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'synthetic-public', VAPID_PRIVATE_KEY: 'synthetic-private' }
  const push = load('src/server/push.ts', {
    'server-only': {}, './db': { getDb: () => db }, './db/schema': { pushSubscriptions: table },
    'drizzle-orm': { eq: (column, value) => ['eq', column, value], and: (...parts) => ['and', ...parts] },
    './objects': { countUnfiled(owner) {
      assert.ok(Object.hasOwn(counts, owner))
      calls.counts.push(owner)
      return track(Promise.resolve().then(() => {
        if (fail.count?.[owner]) throw fail.count[owner]
        return counts[owner]
      }))
    } },
    'web-push': { sendNotification(row, payload, options) {
      calls.sends.push({ row: plain(row), payload, options: plain(options) })
      sendStarted.resolve()
      return track((async () => {
        if (sendGate) await sendGate.promise
        if (fail.send?.[row.endpoint]) throw fail.send[row.endpoint]
      })())
    } },
  }, env, calls.errors)
  const route = load('src/app/api/cron/unfiled-reminders/route.ts', {
    '@/server/db': { getDb: () => db }, '@/server/db/schema': { users }, '@/server/push': push,
  }, env, calls.errors)
  return {
    calls, sendStarted, pruneStarted,
    remaining: () => subscriptions,
    reminder: owner => track(push.sendUnfiledReminder(owner)),
    get: (authorization = 'Bearer synthetic-cron') => track(route.GET(new Request('https://capsule.invalid/api/cron/unfiled-reminders', {
      headers: authorization === null ? {} : { authorization },
    }))),
    getRaw: authorization => track(route.GET({ headers: { get(name) {
      assert.equal(name, 'authorization')
      return authorization
    } } })),
    async settle() {
      sendGate?.resolve()
      pruneGate?.resolve()
      let drained = 0
      while (drained < pending.length) {
        const batch = pending.slice(drained)
        drained = pending.length
        await Promise.allSettled(batch)
      }
    },
  }
}

let checks = 0
async function check(name, options, test) {
  const f = fixture(options)
  try { await test(f) } finally { await f.settle() }
  checks++
  console.log(`PASS ${name}`)
}

async function success(response, owners) {
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, owners })
}

async function failure(response, f, error) {
  assert.equal(response.status, 500)
  assert.equal(await response.text(), 'Could not send unfiled reminders')
  assert.equal(f.calls.errors.length, 1)
  assert.equal(f.calls.errors[0][0], 'unfiled reminder cron failed')
  assert.equal(f.calls.errors[0][1], error)
}

function sent(f, rows, count) {
  assert.deepEqual(f.calls.sends, rows.map(row => ({
    row: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    payload: JSON.stringify(message(count)),
    options: { vapidDetails: { subject: 'https://capsule-omega-ruby.vercel.app', publicKey: 'synthetic-public', privateKey: 'synthetic-private' } },
  })))
}

for (const count of [0, 1, 2]) {
  await check(`direct helper count ${count}`, { counts: { one: count } }, async f => {
    await f.reminder('one')
    assert.deepEqual(f.calls.counts, ['one'])
    assert.deepEqual(f.calls.queries, count ? ['one'] : [])
    sent(f, count ? [subscription('one')] : [], count)
    assert.equal(f.calls.users, 0)
    assert.deepEqual(f.calls.prunes, [])
  })
}

await check('direct helper without subscriptions', { rows: [] }, async f => {
  await f.reminder('one')
  assert.deepEqual(f.calls.queries, ['one'])
  assert.deepEqual(f.calls.sends, [])
})

for (const header of [null, 'Bearer wrong', 'synthetic-cron']) {
  await check(`configured-secret authorization ${JSON.stringify(header)}`, {}, async f => {
    const response = await f.get(header)
    assert.equal(response.status, 401)
    assert.equal(await response.text(), 'Unauthorized')
    assert.deepEqual(f.calls, { users: 0, counts: [], queries: [], sends: [], prunes: [], errors: [] })
  })
}

for (const cronEnv of [{}, { CRON_SECRET: '' }]) {
  for (const header of [null, 'Bearer wrong', 'Bearer undefined', 'Bearer ']) {
    await check(`${Object.hasOwn(cronEnv, 'CRON_SECRET') ? 'empty' : 'unset'} secret rejects ${JSON.stringify(header)}`, { cronEnv }, async f => {
      const response = await f.get(header)
      assert.equal(response.status, 401)
      assert.equal(await response.text(), 'Unauthorized')
      assert.deepEqual(f.calls, { users: 0, counts: [], queries: [], sends: [], prunes: [], errors: [] })
    })
  }
}

await check('empty secret rejects exact unnormalized bearer', { cronEnv: { CRON_SECRET: '' } }, async f => {
  // Request trims header whitespace; supply the exact interpolated value to the handler.
  const response = await f.getRaw('Bearer ')
  assert.equal(response.status, 401)
  assert.equal(await response.text(), 'Unauthorized')
  assert.deepEqual(f.calls, { users: 0, counts: [], queries: [], sends: [], prunes: [], errors: [] })
})

await check('GET no owners', { counts: {} }, async f => {
  await success(await f.get(), 0)
  assert.equal(f.calls.users, 1)
  assert.deepEqual(f.calls.counts, [])
  assert.deepEqual(f.calls.sends, [])
})

await check('GET mixed counts and disjoint subscriptions', {
  counts: { zero: 0, one: 1, two: 2, unsubscribed: 1 },
  rows: [subscription('zero'), subscription('one'), subscription('two', 'two-a'), subscription('two', 'two-b')],
}, async f => {
  await success(await f.get(), 4)
  assert.equal(f.calls.users, 1)
  assert.deepEqual(f.calls.counts.sort(), ['one', 'two', 'unsubscribed', 'zero'])
  assert.deepEqual(f.calls.queries.sort(), ['one', 'two', 'unsubscribed'])
  assert.equal(f.calls.sends.length, 3)
  const actual = new Map(f.calls.sends.map(send => [send.row.endpoint, send]))
  for (const row of [subscription('one'), subscription('two', 'two-a'), subscription('two', 'two-b')]) {
    sent({ calls: { sends: [actual.get(row.endpoint)] } }, [row], row.ownerId === 'one' ? 1 : 2)
  }
  assert.deepEqual(f.calls.prunes, [])
  assert.deepEqual(f.calls.errors, [])
})

const sendGate = signal()
await check('GET awaits started transport', { sendGate }, async f => {
  let settled = false
  const request = f.get().then(response => { settled = true; return response })
  await f.sendStarted.promise
  await new Promise(setImmediate)
  assert.equal(settled, false)
  sendGate.resolve()
  await success(await request, 1)
})

for (const stage of ['users', 'count', 'query', 'send']) {
  const error = new Error(`synthetic ${stage} failure`)
  const fail = stage === 'users' ? { users: error } : { [stage]: { [stage === 'send' ? subscription('one').endpoint : 'one']: error } }
  await check(`GET ${stage} failure`, { fail }, async f => {
    await failure(await f.get(), f, error)
    assert.deepEqual(f.calls.prunes, [])
    if (stage !== 'send') assert.deepEqual(f.calls.sends, [])
    if (stage === 'users') assert.deepEqual(f.calls.counts, [])
  })
  if (stage !== 'users') {
    await check(`direct helper ${stage} rejection`, { fail }, async f => {
      await assert.rejects(f.reminder('one'), value => value === error)
      assert.deepEqual(f.calls.errors, [])
      assert.deepEqual(f.calls.prunes, [])
    })
  }
}

for (const statusCode of [404, 410]) {
  const row = subscription('one', 'shared-endpoint')
  const peer = subscription('peer', 'shared-endpoint')
  const live = subscription('one', 'live')
  const pruneGate = signal()
  await check(`GET awaits owner+endpoint prune for ${statusCode}`, {
    counts: { one: 1, peer: 0 }, rows: [row, peer, live], pruneGate,
    fail: { send: { [row.endpoint]: Object.assign(new Error('gone'), { statusCode }) } },
  }, async f => {
    let settled = false
    const request = f.get().then(response => { settled = true; return response })
    await f.pruneStarted.promise
    await new Promise(setImmediate)
    assert.equal(settled, false)
    assert.deepEqual(f.calls.prunes, [{ owner: 'one', endpoint: row.endpoint }])
    assert.deepEqual(f.remaining(), [row, peer, live])
    pruneGate.resolve()
    await success(await request, 2)
    assert.deepEqual(f.remaining(), [peer, live])
    assert.equal(f.calls.sends.length, 2)
    assert.deepEqual(f.calls.errors, [])
  })
}

const pruneError = new Error('synthetic prune failure')
const pruneGate = signal()
await check('GET awaits failed prune', {
  pruneGate, fail: { send: { [subscription('one').endpoint]: Object.assign(new Error('gone'), { statusCode: 410 }) }, prune: pruneError },
}, async f => {
  let settled = false
  const request = f.get().then(response => { settled = true; return response })
  await f.pruneStarted.promise
  await new Promise(setImmediate)
  assert.equal(settled, false)
  pruneGate.resolve()
  await failure(await request, f, pruneError)
  assert.deepEqual(f.remaining(), [subscription('one')])
})

console.log(`All ${checks} cron reminder unit checks passed; counts, subscriptions and transport were in memory.`)
console.log('Persisted SQL classification/ownership and provider delivery are not covered by this unit proof.')
