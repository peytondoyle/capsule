import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
const require = createRequire(`${process.env.OFFLINE_RUNTIME ?? '/private/tmp/capsule-offline-runtime'}/package.json`)
Object.assign(globalThis, require('fake-indexeddb'))
const outdir = mkdtempSync(`${tmpdir()}/capsule-offline-links-`)
for (const name of ['store', 'edits', 'links', 'library']) buildSync({entryPoints:[`src/lib/offline/${name}.ts`],bundle:true,format:'esm',outfile:`${outdir}/${name}.mjs`,platform:'node'})
const store = await import(`${outdir}/store.mjs`)
const { projectArchive, reviewObject } = await import(`${outdir}/edits.mjs`)
const { linkChoices, sameField } = await import(`${outdir}/links.mjs`)
const { searchArchive, linkedNames } = await import(`${outdir}/library.mjs`)
const owner = 'local-links', id = crypto.randomUUID()
const ada = {id:crypto.randomUUID(),name:'Ada',revision:1}, tag = {id:crypto.randomUUID(),name:'Travel',revision:1}, smart = {id:crypto.randomUUID(),name:'Automatic',kind:'smart',revision:1}
const snapshot = {version:1,ownerId:owner,records:[{id,revision:1,title:'Ticket',story:null}],faces:[],people:[ada],tags:[tag],places:[],occasions:[],collections:[smart],objectPeople:[{objectId:id,personId:ada.id,role:'mentioned'}],objectTags:[],memberships:[{objectId:id,collectionId:smart.id,sortOrder:7}],pendingIntake:[],tombstones:[]}
const current = async () => {const {archive,operations}=await store.readLibrary(owner);return projectArchive(archive.snapshot,operations)}
try {
  await store.replaceSnapshot(owner,snapshot)
  const initial = (await current()).records[0]
  const grace={id:crypto.randomUUID(),name:'Grace',create:true}, paper={id:crypto.randomUUID(),name:'Paper',create:true}, shelf={id:crypto.randomUUID(),name:'Journeys',create:true}
  const operation=await store.saveObjectChanges(owner,id,initial,{givenBy:[ada,grace],depicted:[grace],tagged:[tag,paper],inCollections:[shelf]})
  let projected=await current()
  assert.deepEqual(linkedNames(projected,projected.records[0]).people.sort(),['Ada','Grace'])
  assert.equal(projected.objectPeople.filter(link=>link.role==='mentioned').length,1,'editing giver preserves other roles')
  assert.equal(searchArchive(projected,'Grace Paper Journeys').length,1)
  for(const [kind,ref] of [['person',grace],['tag',paper],['collection',shelf]]) assert.equal(searchArchive(projected,'',`${kind}:${ref.id}`).length,1)
  assert.ok(linkChoices(projected,'givenBy').find(ref=>ref.id===grace.id).create,'new references remain creatable for later operations')
  assert.ok(projected.memberships.some(link=>link.collectionId===smart.id&&link.sortOrder===7))
  assert.ok(!linkChoices(projected,'inCollections').some(ref=>ref.id===smart.id))
  await assert.rejects(store.saveObjectChanges(owner,id,initial,{givenBy:[]}),/another tab/)
  assert.ok(sameField('givenBy',[ada,grace],[{...grace,name:'Renamed'},ada]),'labels and array order cannot cause false link conflicts')
  await store.saveObjectChanges(owner,id,projected.records[0],{tagged:[paper]})
  assert.equal((await store.listOperations(owner))[1].mutation.patch.base.tagged.length,2)
  assert.equal(searchArchive(await current(),'','tag:'+tag.id).length,0)
  for(const refs of [[{id:'bad',name:'Bad'}],[ada,ada],[{id:crypto.randomUUID(),name:''}],[{id:crypto.randomUUID(),name:'Unknown'}]]) await assert.rejects(store.saveObjectChanges(owner,id,(await current()).records[0],{givenBy:refs}))
  console.log('PASS durable role/tag/collection edits, newly named references, search/filter overlays, stale tabs, and validation')

  const remote={...initial,tagged:[],givenBy:[ada],depicted:[],inCollections:[],revision:2}
  await store.recordResponse(owner,{operationId:operation.operationId,outcome:'conflict',conflict:{entity:'object',id,revision:2,current:remote,fields:['givenBy']}})
  const before=await store.readLibrary(owner),review=reviewObject(before.archive,before.operations,id)
  assert.equal(review.local.tagged[0].name,'Paper')
  await store.resolveObjectChanges(owner,id,review.token,{givenBy:'remote',depicted:'local',tagged:'local',inCollections:'local'})
  projected=await current()
  assert.deepEqual(projected.records[0].givenBy.map(ref=>ref.id),[ada.id])
  assert.equal(projected.objectPeople.filter(link=>link.personId===grace.id&&link.role==='depicted').length,1)
  assert.equal(projected.objectPeople.filter(link=>link.personId===grace.id&&link.role==='given_by').length,0)
  assert.equal((await store.listOperations(owner)).length,1)
  const resolved=(await store.listOperations(owner))[0]
  assert.equal(resolved.mutation.patch.changes.tagged[0].create,true)
  assert.deepEqual(resolved.mutation.patch.base.tagged,[])
  console.log('PASS conflict resolution preserves newly created references and rebuilds relationship graphs atomically')
  const newPlace={id:crypto.randomUUID(),name:'Union Station',create:true},newOccasion={id:crypto.randomUUID(),name:'Birthday',create:true}
  const beforeLocation=(await current()).records[0]
  await store.saveObjectChanges(owner,id,beforeLocation,{atPlace:[newPlace],onOccasion:[newOccasion]})
  projected=await current()
  assert.equal(projected.records[0].placeId,newPlace.id)
  assert.equal(projected.records[0].occasionId,newOccasion.id)
  assert.equal(searchArchive(projected,'Union Birthday').length,1)
  assert.equal(searchArchive(projected,'','place:'+newPlace.id).length,1)
  assert.equal(searchArchive(projected,'','occasion:'+newOccasion.id).length,1)
  await assert.rejects(store.saveObjectChanges(owner,id,beforeLocation,{atPlace:[]}),/another tab/)
  await assert.rejects(store.saveObjectChanges(owner,id,projected.records[0],{atPlace:[newPlace,{id:crypto.randomUUID(),name:'Second',create:true}]}))
  await store.saveObjectChanges(owner,id,projected.records[0],{atPlace:[]})
  assert.equal((await current()).records[0].placeId,null)
  await store.saveObjectChanges(owner,id,(await current()).records[0],{placeId:null})
  assert.equal((await current()).records[0].placeId,null,'legacy scalar edits remain compatible')
  console.log('PASS offline place/occasion creation, single selection, clearing, search, filters, and legacy edits')
  const large={...snapshot,records:[],people:[],objectPeople:[],objectTags:[],memberships:[],tags:[],collections:[]}
  for(let i=0;i<5001;i++){const objectId=crypto.randomUUID(),personId=crypto.randomUUID();large.records.push({id:objectId,title:'Object '+i,revision:1});large.people.push({id:personId,name:'Person '+i,revision:1});large.objectPeople.push({objectId,personId,role:'given_by'})}
  const started=performance.now(),all=projectArchive(large,[])
  assert.equal(all.records[5000].givenBy[0].name,'Person 5000')
  assert.equal(all.objectPeople.length,5001)
  console.log(`PASS complete relationship projection: 5,001 linked objects in ${Math.round(performance.now()-started)}ms`)

} finally {rmSync(outdir,{recursive:true,force:true})}
