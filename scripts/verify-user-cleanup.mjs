import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const read = (url) => fs.readFileSync(url, 'utf8')
const compile = (source) => transformSync(source, { format: 'cjs', loader: 'ts', target: 'node20' }).code

function load(source, modules) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(compile(source), {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
      return modules[name]
    },
  })
  return sandboxModule.exports
}

const blob = load(read(new URL('../src/server/blob.ts', import.meta.url)), { 'server-only': {} })
const userSource = read(new URL('../src/server/users.ts', import.meta.url))
const fields = (names) => Object.fromEntries(names.map((name) => [name, name]))
const schema = {
  objectFaces: fields(['objectId', 'originalUrl', 'cutoutUrl', 'thumbUrl', 'maskUrl']),
  objects: fields(['id', 'ownerId']),
  intakeBatches: fields(['id', 'ownerId']),
  intakeItems: fields(['batchId', 'originalUrl', 'cutoutUrl', 'thumbUrl']),
  ownerCounters: {},
  users: fields(['id']),
}

const faces = [{
  originalUrl: 'https://private/face-original',
  cutoutUrl: 'https://media/objects/face/random-cutout-a.webp',
  thumbUrl: 'https://media/objects/face/random-thumb-b.webp',
  maskUrl: 'https://media/objects/face/random-mask-c.webp',
}]
const items = [
  {
    originalUrl: 'https://private/current-intake-original',
    cutoutUrl: 'https://media/intake/current/random-cutout-d.webp',
    thumbUrl: 'https://media/intake/current/random-thumb-e.webp',
  },
  {
    originalUrl: 'https://private/legacy-intake-original',
    cutoutUrl: 'https://media/intake/legacy/cutout.webp',
    thumbUrl: null,
  },
]

function project(selection, rows) {
  return rows.map((row) => Object.fromEntries(Object.keys(selection).map((key) => [key, row[key]])))
}

async function run(source) {
  let deletedBlobs
  let deletedUser
  const db = {
    select(selection) {
      const rows = selection.maskUrl ? project(selection, faces) : project(selection, items)
      return {
        from() { return this },
        innerJoin() { return this },
        where() { return Promise.resolve(rows) },
      }
    },
    delete(table) {
      assert.equal(table, schema.users)
      return { where(condition) { deletedUser = condition } }
    },
  }
  const users = load(source, {
    'server-only': {},
    'drizzle-orm': { eq: (...args) => args },
    './blob': { deleteBlobs: async (urls) => { deletedBlobs = urls }, thumbBesideCutout: blob.thumbBesideCutout },
    './db': { getDb: () => db },
    './db/schema': schema,
  })

  await users.deleteUser('owner-1')
  assert.equal(JSON.stringify(deletedBlobs), JSON.stringify({
    originals: [
      'https://private/face-original',
      'https://private/current-intake-original',
      'https://private/legacy-intake-original',
    ],
    media: [
      'https://media/objects/face/random-cutout-a.webp',
      'https://media/objects/face/random-thumb-b.webp',
      null,
      'https://media/objects/face/random-mask-c.webp',
      'https://media/intake/current/random-cutout-d.webp',
      'https://media/intake/current/random-thumb-e.webp',
      null,
      'https://media/intake/legacy/cutout.webp',
      null,
      'https://media/intake/legacy/t640.webp',
    ],
  }))
  assert.equal(JSON.stringify(deletedUser), JSON.stringify(['id', 'owner-1']))
}

await run(userSource)
console.log('verify-user-cleanup: passed')
