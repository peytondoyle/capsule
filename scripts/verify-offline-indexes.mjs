import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(`${tmpdir()}/capsule-indexes-`), out = `${dir}/indexes.mjs`, editsOut = `${dir}/edits.mjs`
buildSync({ entryPoints: ['src/lib/offline/indexes.ts'], bundle: true, format: 'esm', outfile: out, platform: 'node' })
buildSync({ entryPoints: ['src/lib/offline/edits.ts'], bundle: true, format: 'esm', outfile: editsOut, platform: 'node' })
const { archiveIndex, indexObjectIds } = await import(pathToFileURL(out)), { projectArchive } = await import(pathToFileURL(editsOut))
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const snapshot = {
  version: 1, ownerId: 'owner', records: [
    { id: id(1), lotNo: 1, title: 'One', placeId: id(10), occasionId: id(20) },
    { id: id(2), lotNo: 2, title: 'Two', placeId: id(11), occasionId: null, atPlace: [{ id: id(11), name: 'Same' }] },
    { id: id(3), lotNo: 3, title: 'Three', placeId: null, occasionId: id(20), onOccasion: [{ id: id(20), name: 'Trip' }] },
  ], faces: [], people: [
    { id: id(30), name: 'ada', note: 'Analytical' }, { id: id(31), name: 'Ada' }, { id: id(32), name: 'Empty', note: 'Pilot' },
  ], places: [{ id: id(10), name: 'Same', kind: 'US' }, { id: id(11), name: 'Same', kind: 'France' }, { id: id(12), name: 'Empty' }], occasions: [{ id: id(20), name: 'Trip' }, { id: id(21), name: 'Empty' }], tags: [], collections: [], memberships: [],
  objectPeople: [
    { objectId: id(1), personId: id(30), role: 'given_by' }, { objectId: id(1), personId: id(30), role: 'given_by' },
    { objectId: id(1), personId: id(30), role: 'depicted' }, { objectId: id(2), personId: id(30), role: 'mentioned' },
    { objectId: id(99), personId: id(30), role: 'given_by' }, { objectId: id(1), personId: id(99), role: 'given_by' },
  ], objectTags: [], pendingIntake: [], tombstones: [],
}
const before = JSON.stringify(snapshot)
const people = archiveIndex(snapshot, 'people')
assert.deepEqual(people.find(row => row.record.id === id(30))?.roles, { given_by: 1, depicted: 1, mentioned: 1 })
assert.equal(people.find(row => row.record.id === id(30))?.objectCount, 2)
assert.equal(people.find(row => row.record.id === id(32))?.objectCount, 0)
assert.equal(archiveIndex(snapshot, 'people', 'pilot').length, 1)
assert.equal(archiveIndex(snapshot, 'places', 'france')[0].record.id, id(11))
assert.equal(archiveIndex(snapshot, 'occasions', 'trip')[0].record.id, id(20))
assert.equal(archiveIndex(snapshot, 'places').length, 3)
assert.equal(archiveIndex(snapshot, 'places')[0].record.id, id(12))
assert.deepEqual(indexObjectIds(snapshot, 'people', id(30)), new Set([id(1), id(2)]))
assert.deepEqual(indexObjectIds(snapshot, 'people', id(30), 'given_by'), new Set([id(1)]))
assert.deepEqual(indexObjectIds(snapshot, 'people', id(99)), new Set())
assert.deepEqual(indexObjectIds(snapshot, 'places', id(10)), new Set([id(1)]))
assert.deepEqual(indexObjectIds(snapshot, 'places', id(11)), new Set([id(2)]))
assert.deepEqual(indexObjectIds(snapshot, 'occasions', id(20)), new Set([id(1), id(3)]))
assert.equal(JSON.stringify(snapshot), before)

const projected = structuredClone(snapshot)
projected.records[0].atPlace = [{ id: id(12), name: 'Empty' }]
projected.records[0].placeId = null
projected.objectPeople = projected.objectPeople.filter(link => !(link.objectId === id(1) && link.personId === id(30) && link.role === 'given_by'))
assert.deepEqual(indexObjectIds(projected, 'places', id(12)), new Set([id(1)]))
assert.deepEqual(indexObjectIds(projected, 'people', id(30), 'given_by'), new Set())

const patchEntry = (sequence, changes) => ({ ownerId: 'owner', sequence, operationId: id(500 + sequence), createdAt: sequence, mutation: { type: 'object.patch', patch: { id: id(1), baseRevision: 1, base: {}, changes } } })
const added = projectArchive(snapshot, [patchEntry(1, { atPlace: [{ id: id(12), name: 'Empty', create: true }] }), patchEntry(2, { givenBy: [{ id: id(33), name: 'Local', create: true }] })])
assert.deepEqual(indexObjectIds(added, 'places', id(12)), new Set([id(1)]))
assert.deepEqual(indexObjectIds(added, 'people', id(33), 'given_by'), new Set([id(1)]))
const removed = projectArchive(added, [patchEntry(3, { atPlace: [] }), patchEntry(4, { givenBy: [] })])
assert.deepEqual(indexObjectIds(removed, 'places', id(12)), new Set())
assert.deepEqual(indexObjectIds(removed, 'people', id(33), 'given_by'), new Set())

const many = structuredClone(snapshot)
many.records = Array.from({ length: 5001 }, (_, n) => ({ id: id(n + 1000), lotNo: n, title: `Object ${n}`, placeId: id(20000), occasionId: id(30000) }))
many.people = Array.from({ length: 5001 }, (_, n) => ({ id: id(n + 10000), name: `Person ${n}` }))
many.places = Array.from({ length: 5001 }, (_, n) => ({ id: id(n + 20000), name: `Place ${n}` }))
many.occasions = Array.from({ length: 5001 }, (_, n) => ({ id: id(n + 30000), name: `Occasion ${n}` }))
many.objectPeople = many.records.map((record, n) => ({ objectId: record.id, personId: id(n + 10000), role: 'given_by' }))
const started = performance.now()
assert.equal(archiveIndex(many, 'places').find(row => row.record.id === id(20000)).objectCount, 5001)
assert.ok(performance.now() - started < 1500)
console.log('verify-offline-indexes: passed duplicates, empty entries, orphan links, exact roles, projected links, immutability, and 5001 objects')
