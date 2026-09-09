import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-note-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineNoteEditor } from './src/components/offline-note-editor'; export const render = props => renderToStaticMarkup(createElement(OfflineNoteEditor, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const base = { id: 'person-1', initialNote: 'First\nsecond', onSave: async () => {}, onDiscard: async () => {}, onClose: () => {} }
try {
  const normal = render(base)
  assert.match(normal, /Edit person note/); assert.match(normal, /<textarea[^>]*maxLength="20000"/i); assert.match(normal, /<label/); assert.match(normal, /SAVE NOTE ON DEVICE/)
  const empty = render({ ...base, initialNote: null }); assert.match(empty, /Leave it empty to clear/); assert.doesNotMatch(empty, /required=/)
  const conflict = render({ ...base, review: { archiveNote: null, missing: false, rejected: false } })
  assert.match(conflict, /No note/); assert.match(conflict, /KEEP ARCHIVE NOTE/); assert.match(conflict, /<textarea/)
  for (const review of [{ archiveNote: null, missing: true, rejected: false }, { archiveNote: 'Old', missing: false, rejected: true }]) {
    const html = render({ ...base, review }); assert.doesNotMatch(html, /<textarea/); assert.match(html, /DISCARD LOCAL NOTE CHANGE/); assert.match(html, /SAVE LOCAL NOTE/)
  }
  const hostile = '<script>alert(1)</script>\n  exact text  '
  const escaped = render({ ...base, initialNote: hostile, review: { archiveNote: null, missing: true, rejected: false } })
  assert.doesNotMatch(escaped, /<script>/)
  const encoded = escaped.match(/href="data:application\/json;charset=utf-8,([^"]+)"/)[1]
  const exported = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')))
  assert.equal(exported.note, hostile); assert.equal(exported.id, base.id); assert.equal(exported.missing, true)
  console.log('verify-offline-note-ui: passed labels, empty/clear, conflict/missing/rejected states and exact escaped recovery export')
} finally { rmSync(outdir, { recursive: true, force: true }) }
