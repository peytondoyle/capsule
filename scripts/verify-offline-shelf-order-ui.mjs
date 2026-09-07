import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-order-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineShelfOrder } from './src/components/offline-shelf-order'; export const render = props => renderToStaticMarkup(createElement(OfflineShelfOrder, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']
const snapshot={ownerId:'owner',collections:ids.map((id,index)=>({id,name:index?'B':'A',revision:1,kind:'shelf',sortOrder:0}))}
const archive={ownerId:'owner',snapshot,refreshedAt:3}
const base={snapshot,archive,operations:[],onSave:async()=>{},onKeep:async()=>{},onClose:()=>{}}
try {
 const normal=render(base);assert.match(normal,/Arrange shelves/);assert.match(normal,/Move shelf 1 up/);assert.match(normal,/Move shelf 2 down/);assert.match(normal,/SAVE ORDER ON DEVICE/)
 assert.match(normal, /aria-label="Move shelf 1 up"[^>]*disabled/);assert.match(normal,/aria-label="Move shelf 2 down"[^>]*disabled/)
 assert.match(render({...base,snapshot:{collections:[]}}),/at least two shelves/)
 assert.match(render({...base,snapshot:{collections:[{...snapshot.collections[0],localOnly:true}]}}),/Sync new shelves/)
 const operation={ownerId:'owner',operationId:'order',sequence:1,mutation:{type:'collection.reorder',base:ids.map(id=>({id,sortOrder:0})),ids:[...ids].reverse()}}
 assert.match(render({...base,operations:[operation]}),/Order saved on device/)
 const rejected={...operation,response:{outcome:'rejected'},responseAt:2}
 const review=render({...base,operations:[rejected]});assert.match(review,/Archive order/);assert.match(review,/KEEP ARCHIVE ORDER/);assert.match(review,/SAVE LOCAL SHELF ORDER/)
 const stale=render({...base,archive:{...archive,refreshedAt:1},operations:[rejected]});assert.match(stale,/sync to refresh/);assert.match(stale,/disabled="">KEEP ARCHIVE ORDER/)
 const hostile=render({...base,snapshot:{collections:[{...snapshot.collections[0],name:'<script>x</script>'}]}});assert.doesNotMatch(hostile,/<script>/)
 console.log('verify-offline-shelf-order-ui: passed edge controls, empty/pending/creation states, stale/fresh recovery and escaped output')
} finally {rmSync(outdir,{recursive:true,force:true})}
