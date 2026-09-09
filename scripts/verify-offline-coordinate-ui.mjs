import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-coordinates-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineCoordinateEditor } from './src/components/offline-coordinate-editor'; export const render = props => renderToStaticMarkup(createElement(OfflineCoordinateEditor, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const base={id:'place',name:'Museum',initial:{lat:null,lng:null},linkedCount:2,onSave:async()=>{},onDiscard:async()=>{},onClose:()=>{}}
try {
 const normal=render(base);assert.match(normal,/Edit place coordinates/);assert.match(normal,/LATITUDE/);assert.match(normal,/LONGITUDE/);assert.match(normal,/all 2 linked objects/);assert.match(normal,/step="any"/);assert.match(normal,/min="-90" max="90"/);assert.match(normal,/min="-180" max="180"/)
 assert.match(render({...base,initial:{lat:0,lng:0}}),/value="0"/)
 const review={archive:{lat:7,lng:8},rejected:false},conflict=render({...base,initial:{lat:1,lng:2},review})
 assert.match(conflict,/KEEP ARCHIVE COORDINATES/);assert.match(conflict,/SAVE LOCAL COORDINATES/);assert.match(conflict,/1, 2/);assert.match(conflict,/7, 8/)
 const missing=render({...base,review:{archive:null,rejected:false}});assert.match(missing,/place was removed/);assert.doesNotMatch(missing,/type="number"/);assert.match(missing,/DISCARD LOCAL COORDINATE CHANGE/)
 assert.match(render({...base,review:{...review,rejected:true}}),/could not accept/)
 assert.doesNotMatch(render({...base,name:'<script>x</script>'}),/<script>/)
 console.log('verify-offline-coordinate-ui: passed pair controls/bounds, zero, linked-object explanation, conflict/missing/rejected recovery and escaping')
} finally {rmSync(outdir,{recursive:true,force:true})}
