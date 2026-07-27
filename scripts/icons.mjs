/** Generates the PWA icon set from one SVG definition. Run: node scripts/icons.mjs */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const tile = (pad, bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="${bg}"/>
  <g transform="rotate(-4 256 256)">
    <rect x="${96 + pad}" y="${156 + pad}" width="${320 - pad * 2}" height="${200 - pad * 2}"
      fill="#ffffff" rx="6"/>
    <rect x="${118 + pad}" y="${178 + pad}" width="${276 - pad * 2}" height="${156 - pad * 2}"
      fill="#dfd8c9" rx="3"/>
    <text x="256" y="286" text-anchor="middle"
      font-family="Menlo, monospace" font-size="64" letter-spacing="18"
      fill="#2a251d" font-weight="bold">C</text>
  </g>
</svg>`

for (const [name, size, pad, bg] of [
  ['icon-192.png', 192, 0, '#fbf9f5'],
  ['icon-512.png', 512, 0, '#fbf9f5'],
  // maskable: content inside the 80% safe zone, full-bleed background
  ['icon-maskable-512.png', 512, 40, '#fbf9f5'],
  ['apple-touch-icon.png', 180, 0, '#fbf9f5'],
]) {
  const png = await sharp(Buffer.from(tile(pad, bg))).resize(size, size).png().toBuffer()
  writeFileSync(`public/icons/${name}`, png)
  console.log(name, png.length, 'bytes')
}
