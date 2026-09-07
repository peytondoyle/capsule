import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const out = 'public/offline-assets'
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const css = await postcss([tailwindcss()]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })
const cssHash = createHash('sha256').update(css.css).digest('hex').slice(0, 12)
await writeFile(`${out}/offline-${cssHash}.css`, css.css)
const result = await build({ entryPoints: ['src/offline-app.tsx'], bundle: true, format: 'iife', minify: true, write: false, jsx: 'automatic', platform: 'browser' })
const js = result.outputFiles[0].text
const jsHash = createHash('sha256').update(js).digest('hex').slice(0, 12)
await writeFile(`${out}/offline-${jsHash}.js`, js)
const urls = [`/offline.html`, `/offline-assets/offline-${cssHash}.css`, `/offline-assets/offline-${jsHash}.js`]
const html = `<!doctype html><html lang="en" style="--font-inter:system-ui;--font-plex-mono:monospace"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fbf9f5"><title>Capsule</title><link rel="stylesheet" href="${urls[1]}"></head><body><div id="root"></div><script src="${urls[2]}" defer></script></body></html>`
await writeFile('public/offline.html', html)
const asset = async (url) => ({ url, sha256: createHash('sha256').update(await readFile(`public${url}`)).digest('hex') })
const assets = await Promise.all(urls.map(asset))
await writeFile(`${out}/manifest.json`, JSON.stringify({ assets, digest: createHash('sha256').update(JSON.stringify(assets)).digest('hex') }))
