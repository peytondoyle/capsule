import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import './build-offline.mjs'
const manifest = JSON.parse(await readFile('public/offline-assets/manifest.json', 'utf8'))
await build({ entryPoints: ['src/sw.ts'], bundle: true, minify: true, format: 'esm', outfile: 'public/sw.js', define: { __OFFLINE_ASSETS__: JSON.stringify(manifest.assets), __OFFLINE_DIGEST__: JSON.stringify(manifest.digest) } })
