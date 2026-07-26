/**
 * Seeds an archive with the design doc's own fixtures plus filler.
 *
 *   npm run db:seed                  -- onto the only user in the database
 *   npm run db:seed -- --owner user_123
 *
 * Imports src/server/**, which starts with `import 'server-only'`, so it must
 * run under the react-server condition — the db:seed script sets that.
 */
import { asc, eq } from 'drizzle-orm'

import { getDb } from '../src/server/db'
import {
  collectionObjects,
  collections,
  objectFaces,
  objects,
  users,
  type ObjectKind,
} from '../src/server/db/schema'
import { createObject, type NewObject } from '../src/server/objects'
import { upsertPerson } from '../src/server/people'
import { upsertOccasion, upsertPlace, upsertTag } from '../src/server/taxonomy'

/** Deterministic PRNG so reseeding produces an identical archive. */
function rng(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const KIND_SHAPE: Record<ObjectKind, { silhouette: NewObject['silhouette']; w: number; h: number }> = {
  ticket_stub: { silhouette: 'ticket', w: 780, h: 300 },
  postcard: { silhouette: 'card', w: 1480, h: 1000 },
  polaroid: { silhouette: 'polaroid', w: 1000, h: 1200 },
  photo: { silhouette: 'card', w: 1500, h: 1000 },
  pressed_plant: { silhouette: 'blob', w: 900, h: 1100 },
  pin: { silhouette: 'circle', w: 600, h: 600 },
  matchbook: { silhouette: 'card', w: 600, h: 900 },
  figurine: { silhouette: 'bust', w: 800, h: 1000 },
  note: { silhouette: 'edge', w: 1100, h: 700 },
  letter: { silhouette: 'edge', w: 1000, h: 1400 },
  fabric: { silhouette: 'blob', w: 1000, h: 900 },
  coin: { silhouette: 'circle', w: 500, h: 500 },
  key: { silhouette: 'edge', w: 400, h: 900 },
  other: { silhouette: 'card', w: 1000, h: 1000 },
}

/** Straight from Capsule.dc.html — these are the objects the design was drawn around. */
const FIXTURES: Array<{
  title: string
  kind: keyof typeof KIND_SHAPE
  person?: string
  place?: string
  occasion?: string
  receivedAt?: string
  precision?: NewObject['receivedPrecision']
  story?: string
  retention?: NewObject['retention']
  retainedLocation?: string
  material?: string
  widthMm?: number
  heightMm?: number
  cutStyle?: NewObject['cutStyle']
  tags?: string[]
}> = [
  {
    title: 'Boarding pass, LIS → JFK',
    kind: 'ticket_stub',
    person: 'Dad',
    place: 'Lisbon Airport, gate 24',
    occasion: 'Coming home',
    receivedAt: '2019-11-12',
    story:
      'He wrote the gate number on the back in case I forgot where to meet him. I did forget. He waited anyway, holding two coffees, for an hour and ten.',
    retainedLocation: 'In the blue tin, top shelf',
    material: 'Paper',
    widthMm: 78,
    heightMm: 210,
    cutStyle: 'die_cut',
    tags: ['Portugal', 'Paper', 'Dad'],
  },
  {
    title: 'Pensão Grão',
    kind: 'matchbook',
    place: 'Lisbon',
    receivedAt: '2019-11-10',
    story: 'Nobody gave me this one. It was in the dish by the door and I took it.',
    tags: ['Portugal', 'Paper'],
  },
  {
    title: 'Owl from the mantel',
    kind: 'figurine',
    person: 'Grandma June',
    receivedAt: '2019-11-01',
    precision: 'month',
    story: 'It sat on her mantel my whole childhood. Heavier than it looks.',
    retainedLocation: 'Bookshelf, second row',
    material: 'Brass',
    cutStyle: 'loose',
    tags: ['Brass'],
  },
  {
    title: 'Fern, Point Reyes',
    kind: 'pressed_plant',
    person: 'Nina',
    place: 'Point Reyes',
    receivedAt: '2022-04-09',
    story: 'She pressed it in the guidebook on the drive back and forgot about it for a year.',
    cutStyle: 'loose',
    tags: ['California', 'Nina'],
  },
  {
    title: 'Kitchen, 2 a.m.',
    kind: 'polaroid',
    person: 'Nina',
    receivedAt: '2022-04-09',
    story: 'The flash caught the steam off the kettle. Neither of us remembers what was so funny.',
    tags: ['Nina'],
  },
  {
    title: 'Enamel pin, Blue Bottle',
    kind: 'pin',
    person: 'Theo',
    place: 'Blue Bottle, Mint Plaza',
    receivedAt: '2022-04-22',
    retainedLocation: 'On the denim jacket',
    material: 'Enamel',
    cutStyle: 'die_cut',
    tags: ['Theo'],
  },
  {
    title: 'Marfa, at dusk',
    kind: 'postcard',
    person: 'Aunt Ruth',
    place: 'Marfa',
    occasion: 'Just because',
    receivedAt: '2022-04-30',
    story: 'Four lines on the back, three of them about the weather, one that I still think about.',
    tags: ['Texas 2022', 'Aunt Ruth', 'Paper'],
  },
  {
    title: 'Ticket stub, The Fillmore',
    kind: 'ticket_stub',
    person: 'Theo',
    place: 'The Fillmore, SF',
    occasion: 'A show',
    receivedAt: '2023-06-14',
    story: 'We were too far back to see anything and it did not matter.',
    material: 'Paper',
    tags: ['Music', 'Theo'],
  },
  {
    title: 'Key to the old flat',
    kind: 'key',
    person: 'Nina',
    receivedAt: '2021-08-03',
    story: 'Never handed it back. Nobody asked.',
    material: 'Brass',
    retainedLocation: 'Drawer by the door',
  },
  {
    title: 'Letter, unsent',
    kind: 'letter',
    person: 'Dad',
    receivedAt: '2016-03-19',
    story: 'Found it in a book years after. It is dated the week before he moved out.',
    retention: 'digital_only',
    tags: ['Paper', 'Dad'],
  },
  {
    title: 'Sand dollar, Stinson',
    kind: 'other',
    person: 'Nina',
    place: 'Stinson Beach',
    receivedAt: '2023-09-02',
    cutStyle: 'loose',
    tags: ['California'],
  },
  {
    title: 'Receipt, the good dinner',
    kind: 'note',
    place: 'Lisbon',
    occasion: 'A trip',
    receivedAt: '2019-11-08',
    story: 'Four courses and a wine neither of us could pronounce.',
    retention: 'digital_only',
    tags: ['Portugal', 'Paper'],
  },
]

/** Filler titles, so a seeded archive has enough mass to judge the layouts. */
const FILLER = [
  'Postcard, no message',
  'Concert wristband',
  'Pressed poppy',
  'Coat button',
  'Hotel key card',
  'Train ticket, Lisbon–Sintra',
  'Photo booth strip',
  'Napkin, drawn on',
  'Coin, unidentified',
  'Ribbon from a box',
  'Map, folded soft',
  'Luggage tag',
  'Fortune, kept',
  'Bottle cap',
  'Stamp, corner torn',
  'Shell, small',
  'Programme, opening night',
  'Badge, day pass',
  'Pencil, hotel',
  'Note, three words',
  'Petal, flattened',
  'Postcard, never sent',
  'Matchbook, second one',
  'Photograph, out of focus',
  'Pin, unknown band',
  'Receipt, the bad dinner',
  'Ticket, rained off',
  'Charm from a bracelet',
]

async function main() {
  const db = getDb()

  const ownerArg = process.argv.indexOf('--owner')
  let ownerId = ownerArg > -1 ? process.argv[ownerArg + 1] : undefined

  if (!ownerId) {
    const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt))
    if (rows.length !== 1) {
      console.error(
        rows.length === 0
          ? 'No users yet. Sign in once, then re-run, or pass --owner <clerk user id>.'
          : `${rows.length} users found. Pass --owner <clerk user id>.`,
      )
      process.exit(1)
    }
    ownerId = rows[0]!.id
  }

  const existing = await db.select({ id: objects.id }).from(objects).where(eq(objects.ownerId, ownerId))
  if (existing.length > 0 && !process.argv.includes('--force')) {
    console.error(`${ownerId} already has ${existing.length} objects. Re-run with --force to add more.`)
    process.exit(1)
  }

  console.log(`seeding ${ownerId}`)

  const random = rng(0x0147)
  const personIds = new Map<string, string>()
  const placeIds = new Map<string, string>()
  const occasionIds = new Map<string, string>()
  const tagIds = new Map<string, string>()

  const person = async (name: string) => {
    if (!personIds.has(name)) personIds.set(name, (await upsertPerson(ownerId!, name)).id)
    return personIds.get(name)!
  }
  const place = async (name: string) => {
    if (!placeIds.has(name)) placeIds.set(name, (await upsertPlace(ownerId!, name)).id)
    return placeIds.get(name)!
  }
  const occasion = async (name: string) => {
    if (!occasionIds.has(name)) occasionIds.set(name, (await upsertOccasion(ownerId!, name)).id)
    return occasionIds.get(name)!
  }
  const tag = async (name: string) => {
    if (!tagIds.has(name)) tagIds.set(name, (await upsertTag(ownerId!, name)).id)
    return tagIds.get(name)!
  }

  const created: Array<{ id: string; lotNo: number; title: string }> = []

  async function file(spec: (typeof FIXTURES)[number]) {
    const shape = KIND_SHAPE[spec.kind]!
    const row = await createObject(ownerId!, {
      title: spec.title,
      kind: spec.kind,
      silhouette: shape.silhouette,
      cutStyle: spec.cutStyle ?? 'edge',
      receivedAt: spec.receivedAt ?? null,
      receivedPrecision: spec.precision ?? (spec.receivedAt ? 'day' : 'unknown'),
      placeId: spec.place ? await place(spec.place) : null,
      occasionId: spec.occasion ? await occasion(spec.occasion) : null,
      story: spec.story ?? null,
      retention: spec.retention ?? 'retained',
      retainedLocation: spec.retainedLocation ?? null,
      material: spec.material ?? null,
      widthMm: spec.widthMm ?? null,
      heightMm: spec.heightMm ?? null,
      personIds: spec.person ? [await person(spec.person)] : [],
      tagIds: await Promise.all((spec.tags ?? []).map(tag)),
    })

    // A recto face with no URLs yet: phase 6 fills them in, and until then the
    // UI falls back to the design's hatch placeholder. Dimensions are real so
    // the cutouts already vary in width the way the mockups do.
    await db.insert(objectFaces).values({
      objectId: row.id,
      role: 'recto',
      width: shape.w,
      height: shape.h,
      mime: 'image/webp',
    })

    created.push({ id: row.id, lotNo: row.lotNo, title: row.title })
    return row
  }

  for (const spec of FIXTURES) await file(spec)

  // Filler: spread over the same years, a few deliberately left unfiled so the
  // rust "7" in the rail and the Cabinet's AWAITING ENTRY shelf have content.
  const people = ['Nina', 'Dad', 'Aunt Ruth', 'Theo', 'Grandma June']
  const places = ['Lisbon', 'Marfa', 'The Fillmore, SF', 'Point Reyes', 'Stinson Beach']
  const kinds = Object.keys(KIND_SHAPE) as ObjectKind[]
  const unfiledCount = 7

  for (const [i, title] of FILLER.entries()) {
    const unfiled = i >= FILLER.length - unfiledCount
    const year = 2016 + Math.floor(random() * 9)
    const month = 1 + Math.floor(random() * 12)
    const day = 1 + Math.floor(random() * 28)

    await file({
      title,
      kind: kinds[Math.floor(random() * kinds.length)]!,
      person: unfiled ? undefined : people[Math.floor(random() * people.length)],
      place: unfiled ? undefined : places[Math.floor(random() * places.length)],
      receivedAt: unfiled
        ? undefined
        : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      precision: unfiled ? 'unknown' : 'day',
    })
  }

  // Shelves for the Cabinet, clusters for the Board — same table, different kind.
  const shelves = [
    { name: 'Lisbon, November 2019', match: (t: string) => /lisbon|boarding|pensão|sintra/i.test(t) },
    { name: 'From Nina', match: (t: string) => /fern|kitchen|sand dollar|key to the old flat/i.test(t) },
    { name: 'Oddments', match: (t: string) => /button|cap|coin|charm|shell/i.test(t) },
  ]

  for (const [i, shelf] of shelves.entries()) {
    const [row] = await db
      .insert(collections)
      .values({
        ownerId,
        name: shelf.name,
        kind: i === 2 ? 'cluster' : 'shelf',
        sortOrder: i,
        boardX: 100 + i * 340,
        boardY: 90 + (i % 2) * 60,
        boardW: 320,
        boardH: 260,
        impliedTags: i === 0 ? ['Portugal'] : [],
      })
      .returning()

    const members = created.filter((o) => shelf.match(o.title))
    if (members.length && row) {
      await db.insert(collectionObjects).values(
        members.map((o, order) => ({ collectionId: row.id, objectId: o.id, sortOrder: order })),
      )
    }
  }

  console.log(`  ${created.length} objects, lots ${created[0]?.lotNo}…${created.at(-1)?.lotNo}`)
  console.log(`  ${personIds.size} people, ${placeIds.size} places, ${tagIds.size} tags`)
  console.log('done')
}

// Not top-level await: package.json has no "type": "module", so tsx compiles
// this as CJS and esbuild rejects top-level await there.
main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
