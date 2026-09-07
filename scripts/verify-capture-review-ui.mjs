import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-capture-review-ui-`)
const output = `${outdir}/review.mjs`
buildSync({
  stdin: { contents: `
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { OfflineCaptureReview } from './src/components/offline-capture-review'
    export const renderReview = props => renderToStaticMarkup(createElement(OfflineCaptureReview, props))
    export const reviewTree = props => OfflineCaptureReview(props)
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
})
const { renderReview, reviewTree } = await import(pathToFileURL(output))
const draft = {
  title: 'The concert ticket', kind: 'ticket_stub', receivedAt: '2024-06-18', place: 'The Fillmore',
  occasion: 'Graduation', givenBy: 'Nina', tags: ['music', 'travel'], story: 'We stayed for the encore.\nA night worth keeping.',
  corners: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }],
}
const photo = {
  key: 'local-capture', ownerId: 'owner', name: 'camera.heic', type: 'image/heic', bytes: new Blob(['untouched original']), queuedAt: 1,
  draft, draftRevision: 3, readyToFile: true, syncStarted: true,
  captureConflict: { itemId: 'capture-id', draft },
  downloadUrl: 'blob:https://capsule.test/original', previewUrl: 'blob:https://capsule.test/crop', draftUrl: 'blob:https://capsule.test/details',
}
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
const text = html => decode(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
const anchors = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({ attributes: match[1], label: text(match[2]), href: decode(/href="([^"]*)"/.exec(match[1])?.[1] ?? '') }))
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({ attributes: match[1], label: text(match[2]) }))
const events = []
const props = { photo, busy: false, error: '', onClose: () => events.push('close'), onResolve: copy => events.push(copy) }
function elements(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(elements)
  return [node, ...elements(node.props?.children)]
}
function childText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childText).join('')
  return node?.props ? childText(node.props.children) : ''
}
let checks = 0
function check(name, run) { run(); checks++; console.log(`✓ ${name}`) }

try {
  check('the review renders saved local details and crop without resolving during render', () => {
    const html = renderReview(props), visible = text(html)
    for (const value of [draft.title, draft.receivedAt, draft.place, draft.occasion, draft.givenBy, ...draft.tags, 'We stayed for the encore.', 'A night worth keeping.']) assert.ok(visible.includes(value), `Missing local detail: ${value}`)
    assert.ok(visible.includes('ticket stub') || visible.includes('ticket_stub'))
    assert.match(html, /<img\b[^>]*src="blob:https:\/\/capsule\.test\/crop"/)
    assert.match(html, /<img\b[^>]*alt="[^"]+"/)
    assert.deepEqual(events, [])
    assert.doesNotMatch(html, /<iframe|<script|src="https?:/)
  })

  check('original and local details remain downloadable from the review', () => {
    const links = anchors(renderReview(props))
    const original = links.find(link => link.href === photo.downloadUrl)
    const details = links.find(link => link.href === photo.draftUrl)
    assert.ok(original)
    assert.match(original.attributes, /\bdownload(?:=|\s|$)/)
    assert.match(original.label, /ORIGINAL/i)
    assert.ok(details)
    assert.match(details.attributes, /\bdownload(?:=|\s|$)/)
    assert.match(details.label, /DETAILS|DRAFT/i)
    assert.ok(links.every(link => link.href.startsWith('blob:') || link.href === '/queue'))
    assert.ok(links.some(link => link.href === '/queue' && /ONLINE/.test(link.label)))
  })

  check('copy and discard are explicit separate actions and copy is described as an editable draft', () => {
    const html = renderReview(props), visible = text(html), actions = buttons(html)
    assert.ok(actions.some(button => button.label === 'CREATE SEPARATE DRAFT'))
    assert.ok(actions.some(button => button.label === 'DISCARD MY FILING'))
    assert.match(visible, /draft/i)
    assert.match(visible, /edit|review/i)
    assert.match(visible, /Nothing uploads until you mark that draft ready/)
    assert.doesNotMatch(visible, /automatically fil|automatically upload|will replace the archive/i)
    const nodes = elements(reviewTree(props))
    const copy = nodes.find(node => node.type === 'button' && childText(node) === 'CREATE SEPARATE DRAFT')
    const discard = nodes.find(node => node.type === 'button' && childText(node) === 'DISCARD MY FILING')
    assert.ok(copy && discard)
    copy.props.onClick(); discard.props.onClick()
    assert.deepEqual(events, [true, false])
    const close = nodes.find(node => node.type === 'button' && node.props.onClick === props.onClose)
    assert.ok(close)
    close.props.onClick()
    assert.deepEqual(events, [true, false, 'close'])
  })

  check('busy state disables resolution buttons without losing local details or downloads', () => {
    const html = renderReview({ ...props, busy: true })
    const actions = elements(reviewTree({ ...props, busy: true })).filter(node => node.type === 'button')
    const copy = actions.find(node => /CREATE SEPARATE DRAFT|CREATING|SAVING/.test(childText(node)))
    const discard = actions.find(node => /DISCARD MY FILING|DISCARDING/.test(childText(node)))
    assert.ok(copy?.props.disabled)
    assert.ok(discard?.props.disabled)
    assert.ok(text(html).includes(draft.title))
    assert.ok(anchors(html).some(link => link.href === photo.downloadUrl))
  })

  check('resolution errors are announced while the saved draft stays visible', () => {
    const error = 'This review changed in another tab. Your original is still saved.'
    const html = renderReview({ ...props, error })
    assert.match(html, /role="alert"/)
    assert.ok(text(html).includes(error))
    assert.ok(text(html).includes(draft.story.split('\n')[0]))
    assert.ok(anchors(html).some(link => link.href === photo.downloadUrl))
  })

  check('missing optional preview and details download do not create broken or remote links', () => {
    const html = renderReview({ ...props, photo: { ...photo, previewUrl: undefined, draftUrl: undefined } })
    assert.doesNotMatch(html, /src="undefined"|href="undefined"|src=""/)
    assert.ok(anchors(html).some(link => link.href === photo.downloadUrl))
    assert.ok(anchors(html).every(link => link.href && link.href !== photo.draftUrl))
    assert.ok(text(html).includes(draft.title))
  })

  check('untrusted saved details render as text, preserving the original without executable markup', () => {
    const hostile = '"><script>alert("story")</script>'
    const html = renderReview({ ...props, photo: { ...photo, draft: { ...draft, title: hostile, story: hostile, tags: [hostile] } } })
    assert.doesNotMatch(html, /<script>/)
    assert.ok(text(html).includes(hostile))
    assert.ok(anchors(html).some(link => link.href === photo.downloadUrl))
  })
  console.log(`capture review UI verification passed: ${checks} scenarios; actual component rendering and action callbacks, no external services`)
} finally { rmSync(outdir, { recursive: true, force: true }) }
