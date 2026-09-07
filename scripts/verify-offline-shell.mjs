import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('public/offline-assets/manifest.json', 'utf8'))
assert.ok(Array.isArray(manifest.assets) && manifest.assets.length === 3)
assert.equal(manifest.assets[0].url, '/offline.html')
assert.equal(manifest.digest, createHash('sha256').update(JSON.stringify(manifest.assets)).digest('hex'))
const html = await readFile('public/offline.html', 'utf8')
for (const asset of manifest.assets.slice(1)) {
  assert.match(html, new RegExp(asset.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const bytes = await readFile(`public${asset.url}`)
  assert.ok(bytes.length > 0)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256)
}
assert.equal(createHash('sha256').update(await readFile('public/offline.html')).digest('hex'), manifest.assets[0].sha256)
const js = await readFile(`public${manifest.assets[2].url}`, 'utf8')
assert.doesNotMatch(js, /next\/|@clerk|_next\//i)
const sw = await readFile('public/sw.js', 'utf8')
assert.match(sw, /OFFLINE_READY/)
assert.match(sw, /OFFLINE_READY.*ready/)
assert.match(sw, /offline\.html/)
assert.doesNotMatch(sw, /capsule-offline-shell-v1/)
console.log('verify-offline-shell: passed')
