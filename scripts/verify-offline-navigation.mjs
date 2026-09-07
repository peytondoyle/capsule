import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-navigation-`)
const output = `${outdir}/navigation.mjs`
buildSync({
  stdin: { contents: `
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { OfflineIndex } from './src/components/offline-index'
    export * from './src/lib/offline/navigation'
    export const renderIndex = props => renderToStaticMarkup(createElement(OfflineIndex, props))
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, format: 'esm', outfile: output, platform: 'node', jsx: 'automatic',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
})
const { readOfflineLocation, offlineHref, renderIndex } = await import(pathToFileURL(output))
const origin = 'https://capsule.example'
const url = path => new URL(path, origin)
const read = path => readOfflineLocation(url(path))
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const snapshot = {
  version: 1, ownerId: 'owner',
  records: [{ id: id(1), revision: 1, lotNo: 1, placeId: id(10), occasionId: id(20) }, { id: id(2), revision: 1, lotNo: 2, placeId: id(11), occasionId: id(20) }],
  faces: [], people: [{ id: id(30), revision: 1, name: 'Ada', note: 'A thoughtful giver' }, { id: id(31), revision: 1, name: 'Ada' }, { id: id(32), revision: 1, name: 'Local friend', localOnly: true }],
  places: [{ id: id(10), revision: 1, name: 'Same place', kind: 'concert_hall' }, { id: id(11), revision: 1, name: 'Same place' }],
  occasions: [{ id: id(20), revision: 1, name: 'Birthday' }, { id: id(21), revision: 1, name: 'Graduation' }],
  objectPeople: [{ objectId: id(1), personId: id(30), role: 'given_by' }, { objectId: id(1), personId: id(30), role: 'depicted' }, { objectId: id(2), personId: id(30), role: 'mentioned' }],
  tags: [], collections: [], memberships: [], objectTags: [], pendingIntake: [], tombstones: [],
}
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
const text = html => decode(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({ href: decode(match[1]), text: text(match[2]) }))
const render = (kind, initialQuery = '', saved = snapshot) => renderIndex({ snapshot: saved, kind, initialQuery })
let checks = 0
const failures = []
function check(name, run) {
  try { run(); checks++; console.log(`✓ ${name}`) }
  catch (error) { failures.push({ name, error }); console.error(`✗ ${name}: ${error.message}`) }
}

try {
  check('native directory paths and person IDs roundtrip through local archive URLs', () => {
    for (const kind of ['people', 'places', 'occasions']) {
      assert.equal(read(`/${kind}`).section, kind)
      assert.deepEqual(read(offlineHref(read(`/${kind}`))), read(`/${kind}`))
    }
    const person = read(`/people/${id(30)}`)
    assert.equal(person.section, 'people')
    assert.equal(person.entry, id(30))
    assert.deepEqual(read(offlineHref(person)), person)
  })

  check('native lot selection survives URL roundtrip', () => {
    const native = read('/o/0042?q=ticket&order=oldest')
    assert.equal(native.lot, 42)
    assert.equal(read(offlineHref(native)).lot, 42)
    assert.equal(read(offlineHref(native)).query, 'ticket')
  })

  check('percent-encoded native IDs resolve to the exact ID', () => {
    assert.equal(read(`/people/${id(30).replaceAll('-', '%2D')}`).entry, id(30))
    for (const entry of [id(30), 'local:name / + ? # & %', 'CaseSensitiveID']) {
      assert.equal(read(offlineHref({ section: 'people', entry })).entry, entry)
    }
  })

  check('opening and closing an object preserve search, relationship, filter and order', () => {
    const base = read(`/people/${id(30)}?q=red+ticket&role=depicted&filter=place%3A${id(10)}&order=lot`)
    const opened = read(offlineHref({ ...base, objectId: id(1) }))
    assert.equal(opened.objectId, id(1))
    for (const field of ['section', 'entry', 'query', 'role', 'filter', 'order']) assert.equal(opened[field], base[field])
    const closed = read(offlineHref({ ...opened, objectId: undefined }))
    assert.deepEqual(closed, base)
    for (const role of ['given_by', 'depicted', 'mentioned']) for (const order of ['newest', 'oldest', 'lot']) {
      assert.equal(read(offlineHref({ ...base, role, order })).role, role)
      assert.equal(read(offlineHref({ ...base, role, order })).order, order)
    }
  })

  check('unsafe and malformed route data remains local and cannot turn into navigation', () => {
    for (const attack of ['https://attacker.invalid/path', '//attacker.invalid', 'javascript:alert(1)', '\\attacker.invalid', '<script>alert(1)</script>', '%2f%2fattacker.invalid', 'x&section=people#fragment']) {
      const href = offlineHref({ section: 'places', entry: attack, objectId: attack, query: attack, filter: attack })
      assert.equal(url(href).origin, origin)
      assert.equal(url(href).pathname, '/offline.html')
      assert.equal(url(href).hash, '')
      assert.equal(read(href).query, attack)
      assert.equal(read(href).entry, attack)
      assert.equal(read(href).objectId, attack)
    }
    const invalid = read('/offline.html?section=https%3A%2F%2Fattacker.invalid&order=evil&role=owner&q=%E0%A4%A')
    assert.equal(invalid.section, 'objects')
    assert.equal(invalid.order, 'newest')
    assert.equal(invalid.role, undefined)
    assert.equal(url(offlineHref(invalid)).origin, origin)
    assert.equal(read('/o/-1').lot, undefined)
    assert.equal(read('/o/1e3').lot, undefined)
  })

  check('each directory renders its label, totals, accessible search and native anchors', () => {
    for (const [kind, label] of [['people', 'People'], ['places', 'Places'], ['occasions', 'Occasions']]) {
      const html = render(kind), visible = text(html)
      assert.match(html, new RegExp(`<h1[^>]*>${label}</h1>`))
      assert.ok(visible.includes(`${snapshot[kind].length} SAVED`))
      assert.match(html, new RegExp(`<label[^>]*>[\\s\\S]*SEARCH ${label.toUpperCase()}[\\s\\S]*<input[^>]*type="search"[\\s\\S]*</label>`))
      assert.match(html, /<p role="status"/)
      const anchors = links(html)
      assert.equal(anchors.length, snapshot[kind].length)
      for (const anchor of anchors) {
        assert.equal(url(anchor.href).origin, origin)
        assert.equal(read(anchor.href).section, kind)
        assert.ok(snapshot[kind].some(row => row.id === read(anchor.href).entry))
      }
    }
    assert.ok(text(render('places')).includes('concert hall'))
    assert.ok(text(render('people')).includes('SAVED ON DEVICE'))
  })

  check('same-name entries keep distinct exact IDs and linked object counts', () => {
    const people = links(render('people'))
    const first = people.find(link => read(link.href).entry === id(30))
    const second = people.find(link => read(link.href).entry === id(31))
    assert.ok(first.text.includes('Ada'))
    assert.ok(second.text.includes('Ada'))
    assert.ok(first.text.includes('2 OBJECTS'))
    assert.ok(second.text.includes('0 OBJECTS'))
    assert.notEqual(first.href, second.href)
    const places = links(render('places'))
    assert.equal(places.filter(link => link.text.includes('Same place')).length, 2)
    assert.deepEqual(new Set(places.map(link => read(link.href).entry)), new Set([id(10), id(11)]))
    assert.ok(places.every(link => link.text.includes('1 OBJECT')))
    assert.ok(links(render('occasions')).find(link => read(link.href).entry === id(20)).text.includes('2 OBJECTS'))
  })

  check('search filters rendered rows while preserving total and escaped query text', () => {
    const html = render('people', 'thoughtful')
    assert.equal(links(html).length, 1)
    assert.equal(read(links(html)[0].href).entry, id(30))
    assert.ok(text(html).includes('3 SAVED'))
    assert.ok(text(html).includes('1 PERSON FOUND'))
    assert.match(html, /value="thoughtful"/)
    const malicious = render('people', '"><script>alert(1)</script>')
    assert.doesNotMatch(malicious, /<script>/)
    assert.ok(text(malicious).includes('No matches. Try another name or clear the search.'))
  })

  check('empty directories render useful empty states and searchable zero totals', () => {
    for (const kind of ['people', 'places', 'occasions']) {
      const html = render(kind, '', { ...snapshot, [kind]: [] })
      assert.equal(links(html).length, 0)
      assert.ok(text(html).includes('0 SAVED'))
      assert.ok(text(html).includes(`0 ${kind.toUpperCase()}`))
      assert.ok(text(html).includes(`No ${kind} saved yet.`))
      assert.match(html, /type="search"/)
      assert.doesNotMatch(html, /SHOW MORE/)
    }
  })

  check('51 records render the first 50 with an honest total and Show More remainder', () => {
    for (const kind of ['people', 'places', 'occasions']) {
      const many = { ...snapshot, [kind]: Array.from({ length: 51 }, (_, n) => ({ id: id(100 + n), revision: 1, name: `Entry ${String(n).padStart(2, '0')}` })) }
      const before = JSON.stringify(many), html = render(kind, '', many)
      assert.equal(links(html).length, 50)
      assert.ok(text(html).includes('51 SAVED'))
      assert.ok(text(html).includes(`51 ${kind.toUpperCase()}`))
      assert.match(html, /<button[^>]*type="button"[^>]*>SHOW MORE · 1 REMAINING<\/button>/)
      assert.equal(read(links(html)[0].href).entry, id(100))
      assert.equal(read(links(html).at(-1).href).entry, id(149))
      assert.equal(JSON.stringify(many), before)
    }
  })
  assert.equal(failures.length, 0, failures.map(({ name }) => name).join('; '))
  console.log(`offline navigation verification passed: ${checks} scenarios; actual navigation helpers and rendered OfflineIndex, no external services`)
} finally { rmSync(outdir, { recursive: true, force: true }) }
