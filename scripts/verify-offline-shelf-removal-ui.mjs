import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-shelf-removal-`), output = `${outdir}/editor.mjs`
buildSync({ stdin: { contents: `import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { OfflineTaxonomyDelete } from './src/components/offline-taxonomy-delete'; export const render = props => renderToStaticMarkup(createElement(OfflineTaxonomyDelete, props))`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
const { render } = await import(pathToFileURL(output))
const baseline={metadata:{name:'Keepsakes',kind:'shelf',sortOrder:4,impliedTags:['old'],rule:{test:'saved'}},links:['object:7']}
const current={metadata:{...baseline.metadata,sortOrder:22,impliedTags:['new']},links:['object:33']}
const base={entity:'collection',id:'shelf',base:baseline,review:false,refreshed:true,canRetry:true,linkLabel:link=>`Card · shelf position ${link.split(':')[1]}`,onRemove:async()=>{},onKeep:async()=>{},onClose:()=>{}}
try {
 const normal=render(base);assert.match(normal,/Remove this shelf/);assert.match(normal,/Every object stays/);assert.match(normal,/no share links/);assert.match(normal,/SAVE REMOVAL ON DEVICE/)
 const conflict=render({...base,review:true,current});assert.match(conflict,/CURRENT ARCHIVE/);assert.match(conflict,/Shelf position/);assert.match(conflict,/Filing tags/);assert.match(conflict,/old/);assert.match(conflict,/new/);assert.match(conflict,/shelf position 7/);assert.match(conflict,/shelf position 33/)
 const shared=render({...base,review:true,current,canRetry:false,shareIds:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']});assert.match(shared,/Share record aaaaaaaa/);assert.match(shared,/No share link was revoked/);assert.doesNotMatch(shared,/REMOVE CURRENT ENTRY/);assert.match(shared,/KEEP ARCHIVE ENTRY/)
 assert.match(render({...base,review:true,current,canRetry:false,shareIds:[]}),/cannot be removed/)
 assert.match(render({...base,review:true,current,refreshed:false}),/load the latest entry/)
 assert.doesNotMatch(render({...base,base:{...baseline,metadata:{name:'<script>x</script>'}}}),/<script>/)
 console.log('verify-offline-shelf-removal-ui: passed unshared confirmation, all baseline differences, shared refusal, fresh recovery and escaping')
} finally {rmSync(outdir,{recursive:true,force:true})}
