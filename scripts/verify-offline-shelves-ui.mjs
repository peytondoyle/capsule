import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-shelves-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineShelves } from './src/components/offline-shelves'; export const render = props => renderToStaticMarkup(createElement(OfflineShelves, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const shelf = { id: 'shelf', revision: 1, name: 'Keepsakes', kind: 'shelf', sortOrder: 1 }, snapshot = { version: 1, ownerId: 'owner', records: [{ id: 'object', revision: 1 }], collections: [shelf, { ...shelf, id: 'smart', name: 'Hidden smart', kind: 'smart' }, { ...shelf, id: 'cluster', name: 'Hidden cluster', kind: 'cluster' }], memberships: [{ objectId: 'object', collectionId: 'shelf' }, { objectId: 'missing', collectionId: 'shelf' }] }
const base = { snapshot, operations: [], onRename: () => {}, onOrder: () => {}, onCreate: async () => {}, onDiscardCreation: async () => {}, onClose: () => {} }
try {
 const normal = render(base); assert.match(normal, /Saved shelves/); assert.match(normal, /Keepsakes/); assert.match(normal, /RENAME SHELF/); assert.match(normal, /OPEN OBJECTS/); assert.doesNotMatch(normal, /Hidden smart|Hidden cluster|Elsewhere|Unattributed/); assert.match(normal.replace(/<[^>]*>/g, '').replace(/\s+/g, ' '), /1 OBJECT/)
 const empty = render({ ...base, snapshot: { ...snapshot, collections: [] } }); assert.match(empty, /No saved shelves yet/)
 const pending = render({ ...base, snapshot: { ...snapshot, collections: [{ ...shelf, localOnly: true }] } }); assert.match(pending, /Sync this new shelf/); assert.match(pending, /disabled/)
 const conflict = { ownerId: 'owner', sequence: 1, mutation: { type: 'collection.upsert', id: 'shelf', values: { name: 'Local name' } }, response: { outcome: 'conflict' } }
 assert.match(render({ ...base, operations: [conflict] }), /REVIEW NAME/)
 assert.match(normal, /NEW SHELF NAME/); assert.match(normal, /CREATE SHELF ON DEVICE/)
 const rejected = { ownerId: 'owner', operationId: 'create-1', mutation: { type: 'collection.create', id: 'new', values: { name: 'Rejected shelf' } }, response: { outcome: 'rejected' } }
 const recovery = render({ ...base, operations: [rejected] }); assert.match(recovery, /SAVE NEW SHELF DETAILS/); assert.match(recovery, /DISCARD REJECTED SHELF/); assert.match(recovery, /Rejected shelf/)
 assert.match(render({ ...base, snapshot: { ...snapshot, collections: [{ ...shelf, pendingCreation: true, localOnly: true }] } }), /before adding objects or renaming/)
 assert.match(render({ ...base, snapshot: { ...snapshot, collections: [] }, operations: [conflict] }), /REVIEW UNAVAILABLE SHELF NAME/)
 const hostile = render({ ...base, snapshot: { ...snapshot, collections: [{ ...shelf, name: '<script>alert(1)</script>' }] } }); assert.doesNotMatch(hostile, /<script>/)
 console.log('verify-offline-shelves-ui: passed manual-only list, valid member counts, pending/empty/unavailable recovery states and escaping')
} finally { rmSync(outdir, { recursive: true, force: true }) }
