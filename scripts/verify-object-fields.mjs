import assert from 'node:assert/strict'
import { build, buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'

const outdir = mkdtempSync(`${tmpdir()}/capsule-object-fields-`)
const nodeRequire = createRequire(import.meta.url)
const writes = { taxonomy: [], giver: [], object: [], refresh: [] }

async function actionModule() {
  const source = readFileSync('src/server/actions/objects.ts', 'utf8')
  const transformed = (await build({
    stdin: { contents: source, loader: 'ts', resolveDir: process.cwd() },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    plugins: [{
      name: 'inert-action-dependencies',
      setup(build) {
        const mocks = {
          'next/cache': `export const revalidatePath = value => globalThis.__writes.refresh.push(value)`,
          'next/navigation': `export const redirect = value => { throw Object.assign(new Error('redirect'), { destination: value }) }`,
          '@/server/auth': `export const getCurrentUser = async () => ({ id: 'owner' })`,
          '@/server/objects': `
            export const assertOwned = async () => ({ lotNo: 17 })
            export const updateObject = async (_owner, _id, patch) => globalThis.__writes.object.push(patch)
            export const setGiver = async (...args) => globalThis.__writes.giver.push(args)
            export const attachTag = async () => {}
            export const detachTag = async () => {}
          `,
          '@/server/taxonomy': `
            export const upsertPlace = async (...args) => { globalThis.__writes.taxonomy.push(['place', ...args]); return { id: 'place' } }
            export const upsertOccasion = async (...args) => { globalThis.__writes.taxonomy.push(['occasion', ...args]); return { id: 'occasion' } }
          `,
          '@/lib/timeline': `export const timelineHref = () => '/timeline'`,
        }
        build.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : null)
        build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }))
      },
    }],
  })).outputFiles[0].text
  const compiledModule = { exports: {} }
  vm.runInNewContext(transformed, {
    module: compiledModule, exports: compiledModule.exports, require: nodeRequire, FormData, Error, Number, Math,
    globalThis: { __writes: writes },
  })
  return compiledModule.exports
}

function resetWrites() {
  for (const values of Object.values(writes)) values.length = 0
}

async function verifyAction() {
  const { saveFieldsAction } = await actionModule()
  const data = new FormData()
  data.set('widthMm', '-2147483647')
  data.set('heightMm', '0')
  data.set('material', '  Brass  ')
  await saveFieldsAction('object', data)
  assert.deepEqual(structuredClone(writes.object), [{ widthMm: -2147483647, heightMm: 0, material: 'Brass' }])
  assert.deepEqual(writes.refresh, ['/timeline', '/cabinet', '/o/17'])

  resetWrites()
  const blank = new FormData()
  blank.set('widthMm', '  ')
  blank.set('material', '')
  await saveFieldsAction('object', blank)
  assert.deepEqual(structuredClone(writes.object), [{ widthMm: null, material: null }])

  resetWrites()
  await saveFieldsAction('object', new FormData())
  assert.deepEqual(structuredClone(writes.object), [{}], 'omitted fields are preserved')

  for (const value of ['1.5', 'NaN', 'Infinity', '2147483648', '-2147483648', 'not a number']) {
    resetWrites()
    const invalid = new FormData()
    invalid.set('widthMm', value)
    invalid.set('place', 'Station')
    invalid.set('givenBy', 'Peyton')
    await assert.rejects(saveFieldsAction('object', invalid), /must be an integer/)
    assert.deepEqual({ taxonomy: writes.taxonomy, giver: writes.giver, object: writes.object }, { taxonomy: [], giver: [], object: [] })
  }
  resetWrites()
  const invalidFile = new FormData()
  invalidFile.set('heightMm', new Blob(['1']))
  await assert.rejects(saveFieldsAction('object', invalidFile), /must be an integer/)
  assert.deepEqual({ taxonomy: writes.taxonomy, giver: writes.giver, object: writes.object }, { taxonomy: [], giver: [], object: [] })
  console.log('PASS action signed integers, blank/omitted fields, material trim, pre-write rejection, Cabinet refresh')
}

async function verifyRenderedForm() {
  const entry = `${outdir}/render.jsx`
  writeFileSync(entry, `
    import React from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { OfflineObjectEditor } from ${JSON.stringify(`${process.cwd()}/src/components/offline-object-editor.tsx`)}
    const record = { id: 'object', revision: 1, title: 'Brass owl', kind: 'figurine', receivedAt: null, receivedPrecision: 'unknown', retention: 'retained', retainedLocation: null, material: 'Brass', widthMm: 0, heightMm: -80, story: null }
    const snapshot = { version: 1, ownerId: 'owner', records: [record], faces: [], people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], pendingIntake: [], tombstones: [] }
    process.stdout.write(renderToStaticMarkup(<OfflineObjectEditor record={record} snapshot={snapshot} onSave={async () => {}} onClose={() => {}} />))
  `)
  buildSync({ entryPoints: [entry], bundle: true, format: 'cjs', platform: 'node', outfile: `${outdir}/render.cjs`, jsx: 'automatic', nodePaths: [`${process.cwd()}/node_modules`], alias: { '@': `${process.cwd()}/src` } })
  const rendered = execFileSync(process.execPath, [`${outdir}/render.cjs`], { encoding: 'utf8' })
  for (const expected of ['Width (mm)', 'Height (mm)', 'Material', 'type="number"', 'min="-2147483647"', 'max="2147483647"', 'step="1"', 'value="0"', 'value="-80"', 'value="Brass"']) assert.ok(rendered.includes(expected), `rendered form includes ${expected}`)
  console.log('PASS rendered offline form exposes material and signed integer dimensions from synthetic records')
}

async function verifyLocalStore() {
  const requireFromRuntime = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
  const { indexedDB, IDBKeyRange } = requireFromRuntime('fake-indexeddb')
  Object.assign(globalThis, { indexedDB, IDBKeyRange })
  globalThis.crypto ??= requireFromRuntime('node:crypto').webcrypto
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (_name, _options, callback) => callback({}) } }, configurable: true })
  for (const name of ['store', 'edits']) buildSync({ entryPoints: [`src/lib/offline/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${outdir}/${name}.mjs` })
  const store = await import(`${outdir}/store.mjs`)
  const { projectArchive, reviewObject, validObjectChanges } = await import(`${outdir}/edits.mjs`)
  const row = { id: 'object', revision: 1, title: 'Ticket', story: null, kind: 'ticket_stub', receivedAt: null, receivedPrecision: 'unknown', placeId: null, occasionId: null, retention: 'retained', retainedLocation: null, material: 'Paper', widthMm: 0, heightMm: -80, lotNo: 1 }
  const snapshot = { version: 1, ownerId: 'fields', records: [row], faces: [], people: [], places: [], occasions: [], tags: [], collections: [], memberships: [], objectPeople: [], objectTags: [], pendingIntake: [], tombstones: [] }
  await store.replaceSnapshot('fields', snapshot)
  const operation = await store.saveObjectChanges('fields', 'object', row, { widthMm: 2147483647, heightMm: null, material: 'Card' })
  assert.deepEqual(operation.mutation.patch.changes, { widthMm: 2147483647, heightMm: null, material: 'Card' })
  let { archive, operations } = await store.readLibrary('fields')
  let projected = projectArchive(archive.snapshot, operations).records[0]
  assert.deepEqual([projected.widthMm, projected.heightMm, projected.material], [2147483647, null, 'Card'])
  await store.recordResponse('fields', { operationId: operation.operationId, outcome: 'conflict', conflict: { entity: 'object', id: 'object', revision: 2, current: { ...row, widthMm: 90, heightMm: 80, revision: 2 }, fields: ['widthMm', 'heightMm'] } })
  ;({ archive, operations } = await store.readLibrary('fields'))
  const review = reviewObject(archive, operations, 'object')
  assert.deepEqual([review.local.widthMm, review.local.heightMm], [2147483647, null])
  assert.deepEqual([review.remote.widthMm, review.remote.heightMm], [90, 80])
  for (const value of [null, 0, 2147483647, -2147483647]) assert.equal(validObjectChanges({ widthMm: value }), true)
  for (const value of ['12', 1.5, NaN, Infinity, 2147483648, -2147483648]) assert.equal(validObjectChanges({ heightMm: value }), false)
  console.log('PASS fake IndexedDB persistence, projection, conflict review, and offline numeric validation')
}

try {
  await verifyAction()
  await verifyRenderedForm()
  await verifyLocalStore()
} finally {
  rmSync(outdir, { recursive: true, force: true })
}
