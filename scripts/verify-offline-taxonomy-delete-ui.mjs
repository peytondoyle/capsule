import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const out = mkdtempSync(`${tmpdir()}/delete-ui-`)
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineTaxonomyDelete } from './src/components/offline-taxonomy-delete'; export const render = props => renderToStaticMarkup(createElement(OfflineTaxonomyDelete, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: `${out}/ui.mjs`, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(`${out}/ui.mjs`)
const props = { entity: 'person', id: 'person-id', base: { metadata: { name: 'Ada', note: 'Keep the note', initials: 'AB' }, links: ['lot-1:given_by'] }, review: false, canRetry: true, refreshed: true, linkLabel: value => value, onRemove: async () => {}, onKeep: async () => {}, onClose: () => {} }
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
try {
  const normal = render(props)
  assert.match(text(normal), /Remove this person/); assert.match(text(normal), /SAVE REMOVAL ON DEVICE/); assert.match(text(normal), /KEEP ENTRY/)
  assert.match(text(normal), /objects and photographs stay/); assert.match(text(normal), /Keep the note/); assert.match(text(normal), /lot-1:given_by/)
  assert.match(normal, /type="button"/); assert.doesNotMatch(normal, /<script|<iframe/)
  const exported = JSON.parse(decodeURIComponent(/href="data:application\/json;charset=utf-8,([^"]+)"/.exec(normal)[1]))
  assert.equal(exported.id, props.id); assert.deepEqual(exported.base, props.base)
  const current = { metadata: { name: 'New Ada', note: 'Changed note' }, links: ['lot-2:mentioned'] }
  const changed = render({ ...props, review: true, current })
  for (const value of ['New Ada', 'Changed note', 'lot-2:mentioned', 'Keep the note', 'lot-1:given_by', 'REMOVE CURRENT ENTRY AND LINKS', 'KEEP ARCHIVE ENTRY']) assert.ok(text(changed).includes(value))
  const stale = render({ ...props, review: true, current, refreshed: false })
  assert.match(text(stale), /sync saved edits to load/); assert.doesNotMatch(text(stale), /Changed note/)
  assert.match(stale, /<button[^>]*disabled[^>]*>REMOVE CURRENT ENTRY/); assert.match(stale, /<button[^>]*disabled[^>]*>KEEP ARCHIVE ENTRY/)
  const gone = render({ ...props, review: true, current: null, canRetry: false })
  assert.match(text(gone), /Already removed/); assert.match(text(gone), /DISMISS REMOVAL/); assert.doesNotMatch(text(gone), /REMOVE CURRENT ENTRY|SAVE REMOVAL ON DEVICE/)
  const empty = render({ ...props, base: { metadata: { name: 'No links' }, links: [] } })
  assert.match(text(empty), /0 LINKS TO REMOVE/)
  const hostile = render({ ...props, base: { metadata: { name: '<script>alert(1)</script>' }, links: ['<img src=x onerror=alert(1)>'] } })
  assert.doesNotMatch(hostile, /<script>|<img/); assert.match(hostile, /&lt;script&gt;/)
  console.log('verify-offline-taxonomy-delete-ui: passed confirmation, review, stale/removed/empty states, recovery identity and escaped content')
} finally { rmSync(out, { recursive: true, force: true }) }
