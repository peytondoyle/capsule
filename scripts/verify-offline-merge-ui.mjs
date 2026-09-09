import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-merge-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineOccasionMerge } from './src/components/offline-occasion-merge'; export const render = props => renderToStaticMarkup(createElement(OfflineOccasionMerge, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const source = { revision: 1, metadata: { name: 'Source', createdAt: '2026-01-01' }, links: ['object-1'] }, target = { revision: 2, metadata: { name: 'Target', createdAt: '2026-02-01' }, links: ['object-2'] }
const base = { id: 'source', source, destinations: [{ id: 'target', base: target }], linkLabel: id => id, onMerge: async () => {}, onKeep: async () => {}, onClose: () => {} }
try {
 const normal = render(base); assert.match(normal, /DESTINATION OCCASION/); assert.match(normal, /<label/); assert.match(normal, /<select/); assert.match(normal, /SOURCE TO REMOVE/); assert.match(normal, /object-1/); assert.match(normal, /SAVE MERGE ON DEVICE/)
 assert.match(render({ ...base, destinations: [] }), /No other saved occasion is available/)
 const review = { targetId: 'target', source, target, refreshed: true, canRetry: true }
 const conflict = render({ ...base, review }); assert.match(conflict, /CURRENT SOURCE/); assert.match(conflict, /CURRENT DESTINATION/); assert.match(conflict, /MERGE CURRENT ENTRIES/); assert.match(conflict, /KEEP ARCHIVE ENTRIES/)
 const removed = render({ ...base, review: { ...review, target: null, canRetry: false } }); assert.doesNotMatch(removed, /MERGE CURRENT ENTRIES/); assert.match(removed, /No longer in the archive/); assert.match(removed, /SAVE ENTRIES AND LINKS/)
 const stale = render({ ...base, review: { ...review, refreshed: false } }); assert.match(stale, /refresh both entries/); assert.match(stale, /disabled/)
 const hostile = '<script>alert(1)</script>'
 const escaped = render({ ...base, source: { ...source, metadata: { ...source.metadata, name: hostile } }, review })
 assert.doesNotMatch(escaped, /<script>/)
 const encoded = escaped.match(/href="data:application\/json;charset=utf-8,([^"]+)"/)[1], exported = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')))
 assert.equal(exported.source.metadata.name, hostile); assert.deepEqual(exported.source.links,['object-1']); assert.deepEqual(exported.target, target); assert.equal(exported.targetId,'target')
 console.log('verify-offline-merge-ui: passed destination selection, empty state, both baselines, missing/stale reviews and escaped complete recovery export')
} finally { rmSync(outdir, { recursive: true, force: true }) }
