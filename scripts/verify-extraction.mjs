import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = fs.readFileSync(new URL('../src/app/api/extract/route.ts', import.meta.url), 'utf8')
const compile = (input) => transformSync(input, { format: 'cjs', loader: 'ts', target: 'node20' }).code

function load(input, modules) {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(compile(input), {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Response,
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
      return modules[name]
    },
  })
  return sandboxModule.exports
}

async function run(routeSource) {
  let item = {
    cutoutUrl: 'https://media/cutout.webp',
    status: 'segmented',
    suggestions: { date: { value: '2026-08-15', confidence: 1 } },
    ocr: { upstream: { value: 'keep' } },
  }
  const extractCalls = []
  let consumed = 0
  const updates = []
  const route = load(routeSource, {
    '@/server/auth': { getCurrentUser: async () => ({ id: 'owner-1' }) },
    '@/server/extract': {
      hasExtraction: () => true,
      extractFromImage: async (_source, hints) => {
        extractCalls.push(hints)
        return {
          title: { value: 'Boarding pass', confidence: 0.9 },
          date: { value: hints.exifDate, confidence: 1 },
        }
      },
    },
    '@/server/intake': {
      getIntakeItem: async () => item,
      updateIntakeItem: async (_ownerId, _itemId, patch) => {
        updates.push(patch)
        item = { ...item, ...patch }
      },
    },
    '@/server/limits': {
      consume: async () => {
        consumed += 1
        return { ok: true }
      },
      tooManyRequests: () => new Response('limited', { status: 429 }),
    },
  })
  const post = (body = {}) => route.POST({ json: async () => ({ itemId: 'item-1', ...body }) })

  const first = await post()
  assert.equal(first.status, 200)
  assert.equal(JSON.stringify(await first.json()), JSON.stringify({
    suggestions: {
      title: { value: 'Boarding pass', confidence: 0.9 },
      date: { value: '2026-08-15', confidence: 1 },
    },
  }))
  assert.equal(JSON.stringify(extractCalls), JSON.stringify([{ exifDate: '2026-08-15' }]))
  assert.equal(consumed, 1)
  assert.equal(JSON.stringify(updates[0].ocr), JSON.stringify({
    upstream: { value: 'keep' },
    extraction: { source: 'https://media/cutout.webp' },
  }))

  const cached = await post()
  assert.equal(JSON.stringify(await cached.json()), JSON.stringify({ suggestions: item.suggestions, cached: true }))
  assert.equal(extractCalls.length, 1)
  assert.equal(consumed, 1)

  const forced = await post({ force: true })
  assert.equal(forced.status, 200)
  assert.equal(extractCalls.length, 2)
  assert.equal(consumed, 2)

  item = { ...item, status: 'filed' }
  const filed = await post()
  assert.equal(JSON.stringify(await filed.json()), JSON.stringify({ suggestions: item.suggestions, cached: true }))
  assert.equal(extractCalls.length, 2)
  assert.equal(consumed, 2)

  item = { ...item, cutoutUrl: 'https://media/re-cutout.webp' }
  const rederived = await post()
  assert.equal(rederived.status, 200)
  assert.equal(extractCalls.length, 3)
  assert.equal(consumed, 3)
  assert.equal(JSON.stringify(extractCalls[2]), JSON.stringify({ exifDate: '2026-08-15' }))
}

await run(source)
console.log('verify-extraction: passed')
