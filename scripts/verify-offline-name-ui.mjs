import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-name-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineNameEditor } from './src/components/offline-name-editor'; export const render = props => renderToStaticMarkup(createElement(OfflineNameEditor, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const base = { entity: 'place', id: 'place-1', initialName: 'The Fillmore', onSave: async () => {}, onDiscard: async () => {}, onClose: () => {} }
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
try {
  const normal = render(base)
  assert.match(normal, /Rename this place/); assert.match(normal, /<input[^>]*required[^>]*maxlength="250"/i); assert.match(normal, /SAVE NAME ON DEVICE/); assert.match(normal, /BACK TO ARCHIVE/)
  const duplicate = render({ ...base, review: { archiveName: 'The Fillmore', rejected: false, nameTaken: true } })
  assert.match(text(duplicate), /already used/i); assert.match(text(duplicate), /KEEP ARCHIVE NAME/); assert.match(duplicate, /SAVE LOCAL NAME/)
  const removed = render({ ...base, review: { archiveName: null, rejected: true, nameTaken: false } })
  assert.doesNotMatch(removed, /<input/); assert.match(text(removed), /DISCARD LOCAL RENAME/); assert.match(removed, /download=/)
  const pending = render({ ...base, review: { archiveName: null, rejected: false, nameTaken: false, pending: true } })
  assert.match(text(pending), /linked to an existing archive entry/); assert.doesNotMatch(text(pending), /was removed/); assert.match(text(pending), /Unavailable/); assert.match(pending, /SAVE LOCAL NAME/); assert.doesNotMatch(pending, /<input/)
  const hostile = '"><scr' + 'ipt>alert(1)</scr' + 'ipt>'
  const escaped = render({ ...base, initialName: hostile, review: { archiveName: hostile, rejected: false, nameTaken: false } })
  assert.doesNotMatch(escaped, /<script>/); assert.ok(text(escaped).includes(hostile)); assert.match(escaped, /<label/); assert.match(escaped, /type="submit"/)
  console.log('verify-offline-name-ui: passed')
} finally { rmSync(outdir, { recursive: true, force: true }) }
