/**
 * iOS PWA splash screens. Safari shows a white flash on launch without these —
 * the one thing that most makes an installed PWA feel like a web page.
 * Run: node scripts/splash.mjs
 */
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('public/splash', { recursive: true })

// device-width x device-height @ ratio — the sizes Safari actually matches
const DEVICES = [
  // 16/17-class devices — without these, the phones most likely to install the
  // app today matched no media query and got the white flash.
  [1320, 2868, 3, 'iphone-16-pro-max'],
  [1206, 2622, 3, 'iphone-16-pro'],
  [1179, 2556, 3, 'iphone-16'],
  [1290, 2796, 3, 'iphone-15-pro-max'],
  [1170, 2532, 3, 'iphone-13'],
  [1284, 2778, 3, 'iphone-12-pro-max'],
  [1125, 2436, 3, 'iphone-x'],
  [828, 1792, 2, 'iphone-xr'],
  [750, 1334, 2, 'iphone-8'],
  [1640, 2360, 2, 'ipad-air'],
  [2048, 2732, 2, 'ipad-pro-12'],
]

const screen = (w, h) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#fbf9f5"/>
  <g transform="translate(${w / 2} ${h / 2}) rotate(-3)">
    <rect x="-132" y="-116" width="264" height="232" fill="#ffffff"/>
    <rect x="-118" y="-102" width="236" height="180" fill="#dfd8c9"/>
    <text x="0" y="150" text-anchor="middle" font-family="Menlo, monospace"
      font-size="19" letter-spacing="7" fill="#2a251d" font-weight="600">CAPSULE</text>
  </g>
</svg>`

const links = []
for (const [w, h, ratio, name] of DEVICES) {
  const png = await sharp(Buffer.from(screen(w, h))).png().toBuffer()
  writeFileSync(`public/splash/${name}.png`, png)
  links.push(
    `<link rel="apple-touch-startup-image" href="/splash/${name}.png" ` +
      `media="(device-width: ${w / ratio}px) and (device-height: ${h / ratio}px) ` +
      `and (-webkit-device-pixel-ratio: ${ratio})" />`,
  )
}
console.log(links.length, 'splash screens')
