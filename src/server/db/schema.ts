import { sql } from 'drizzle-orm'
import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ *
 * Shared column helpers
 * ------------------------------------------------------------------ */

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/* ------------------------------------------------------------------ *
 * Enums — closed sets only.
 *
 * `objects.kind` and `objects.material` are deliberately plain text: those
 * taxonomies grow every time someone files something the app has not seen
 * (seashell, keychain, hotel key card…) and an ALTER TYPE per new noun is a
 * tax on the one flow that has to stay frictionless.
 * ------------------------------------------------------------------ */

/** Cut-out shapes from the design doc's CUT STYLE picker and sticker vocabulary. */
export const silhouetteEnum = pgEnum('silhouette', [
  'edge', // square, 2px radius
  'card', // 3px radius
  'ticket', // notched sides — boarding passes, stubs
  'polaroid', // extra bottom chin
  'circle',
  'blob', // 50% 42% 55% 45% / 48% 58% 42% 52%
  'bust', // 46% 46% 32% 32% / 34% 34% 12% 12%
])

/** How the cutout is trimmed — orthogonal to the silhouette. */
export const cutStyleEnum = pgEnum('cut_style', ['edge', 'die_cut', 'loose', 'full'])

/** "Still have it" / "Only here now". */
export const retentionEnum = pgEnum('retention', ['retained', 'digital_only'])

/**
 * How much of `received_at` is real. Objects that land as 'unknown' go to
 * Unfiled rather than into a fabricated month on the timeline.
 */
export const datePrecisionEnum = pgEnum('date_precision', ['day', 'month', 'year', 'unknown'])

/** recto / verso / detail — the three page dots on the Cabinet lot view. */
export const faceRoleEnum = pgEnum('face_role', ['recto', 'verso', 'detail'])

export const personRoleEnum = pgEnum('person_role', ['given_by', 'depicted', 'mentioned'])

/** One table behind the Board's clusters, the Cabinet's shelves, and saved filters. */
export const collectionKindEnum = pgEnum('collection_kind', ['cluster', 'shelf', 'smart'])

export const intakeSourceEnum = pgEnum('intake_source', ['camera', 'share_target', 'files'])

export const intakeStatusEnum = pgEnum('intake_status', [
  'uploaded',
  'segmented',
  'extracted',
  'needs_review',
  'filed',
  'skipped',
])

export const shareScopeEnum = pgEnum('share_scope', ['object', 'collection'])

export const activityKindEnum = pgEnum('activity_kind', [
  'object_added',
  'object_updated',
  'object_filed',
  'collection_created',
  'share_created',
])

/** Open taxonomy — kept in TypeScript so the UI can switch on it exhaustively. */
export const OBJECT_KINDS = [
  'ticket_stub',
  'postcard',
  'polaroid',
  'photo',
  'pressed_plant',
  'pin',
  'matchbook',
  'figurine',
  'note',
  'letter',
  'fabric',
  'coin',
  'key',
  'other',
] as const
export type ObjectKind = (typeof OBJECT_KINDS)[number]

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * Mirror of Clerk users. Created synchronously by ensureUser() on the first
 * authenticated request; /api/webhooks/clerk only propagates later updates and
 * deletes. v1 had a `handle_new_user` Postgres function for this but no
 * migration ever created the trigger, so profiles never auto-created.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt,
  updatedAt,
})

/**
 * Per-owner lot allocation. `objects.lot_no` is gapless and owner-scoped so it
 * can render as OBJ-0147 / LOT 0147; a shared sequence would leak other
 * people's volume and leave gaps.
 */
export const ownerCounters = pgTable('owner_counters', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  nextLot: integer('next_lot').notNull().default(1),
})

/* ------------------------------------------------------------------ *
 * The five fields: who, when, where from, occasion, the story
 * ------------------------------------------------------------------ */

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Generated so the case-insensitive unique constraint is a real column,
     *  which lets onConflictDoUpdate target it. */
    nameKey: text('name_key').generatedAlwaysAs(sql`lower(name)`),
    /** Overrides the derived initials in the 21px avatars on the Ledger rail. */
    initials: text('initials'),
    avatarUrl: text('avatar_url'),
    note: text('note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('people_owner_name_key').on(t.ownerId, t.nameKey),
    index('people_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

export const places = pgTable(
  'places',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Generated so the case-insensitive unique constraint is a real column,
     *  which lets onConflictDoUpdate target it. */
    nameKey: text('name_key').generatedAlwaysAs(sql`lower(name)`),
    /** Nullable: the Cabinet's MAP tab only plots places that got geocoded. */
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    kind: text('kind'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('places_owner_name_key').on(t.ownerId, t.nameKey),
    index('places_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

export const occasions = pgTable(
  'occasions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Generated so the case-insensitive unique constraint is a real column,
     *  which lets onConflictDoUpdate target it. */
    nameKey: text('name_key').generatedAlwaysAs(sql`lower(name)`),
    createdAt,
  },
  (t) => [uniqueIndex('occasions_owner_name_key').on(t.ownerId, t.nameKey)],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Generated so the case-insensitive unique constraint is a real column,
     *  which lets onConflictDoUpdate target it. */
    nameKey: text('name_key').generatedAlwaysAs(sql`lower(name)`),
    createdAt,
  },
  (t) => [uniqueIndex('tags_owner_name_key').on(t.ownerId, t.nameKey)],
)

/* ------------------------------------------------------------------ *
 * The object
 * ------------------------------------------------------------------ */

export const objects = pgTable(
  'objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Gapless per owner. Rendered zero-padded: OBJ-0147, LOT 0147. */
    lotNo: integer('lot_no').notNull(),

    title: text('title').notNull(),
    kind: text('kind').$type<ObjectKind>(),

    silhouette: silhouetteEnum('silhouette').notNull().default('card'),
    cutStyle: cutStyleEnum('cut_style').notNull().default('edge'),
    /**
     * Persisted jitter, roughly -6deg…+9deg. Stored rather than generated at
     * render because Math.random() in a component reshuffles the whole archive
     * on every navigation.
     */
    rotationDeg: real('rotation_deg').notNull().default(0),

    // who / when / where from / occasion / the story
    receivedAt: date('received_at'),
    receivedPrecision: datePrecisionEnum('received_precision').notNull().default('day'),
    placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
    occasionId: uuid('occasion_id').references(() => occasions.id, { onDelete: 'set null' }),
    story: text('story'),

    // the object itself
    retention: retentionEnum('retention').notNull().default('retained'),
    /** Free text: "in the blue tin, top shelf". */
    retainedLocation: text('retained_location'),
    material: text('material'),
    /** Cabinet renders "PAPER · 78 × 210 MM"; both nullable, entered by hand in v1. */
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),

    // Board layout, in board units. Null until the object has been placed.
    boardX: real('board_x'),
    boardY: real('board_y'),
    boardZ: integer('board_z').notNull().default(0),

    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('objects_owner_lot_key').on(t.ownerId, t.lotNo),
    index('objects_owner_received_idx').on(t.ownerId, t.receivedAt.desc()),
    index('objects_owner_created_idx').on(t.ownerId, t.createdAt.desc()),
    index('objects_place_idx').on(t.placeId),
    index('objects_occasion_idx').on(t.occasionId),
    index('objects_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    index('objects_story_trgm_idx').using('gin', sql`${t.story} gin_trgm_ops`),
  ],
)

/**
 * One row per photographed face. Drives "recto · verso →" and the three page
 * dots on the Cabinet lot view.
 *
 * `originalUrl` points at the private Blob store and is never served directly;
 * everything else is public, CDN-cached, and recomputable from the original.
 */
export const objectFaces = pgTable(
  'object_faces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    role: faceRoleEnum('role').notNull().default('recto'),

    originalUrl: text('original_url'), // private store
    cutoutUrl: text('cutout_url'), // public store, alpha WebP
    maskUrl: text('mask_url'),
    thumbUrl: text('thumb_url'),

    width: integer('width'),
    height: integer('height'),
    bytes: bigint('bytes', { mode: 'number' }),
    mime: text('mime'),
    dpi: integer('dpi'),
    exif: jsonb('exif'),

    sortOrder: integer('sort_order').notNull().default(0),
    createdAt,
  },
  (t) => [
    index('object_faces_object_idx').on(t.objectId, t.sortOrder),
    // Exactly one recto per object; details are unbounded.
    uniqueIndex('object_faces_one_recto_key')
      .on(t.objectId)
      .where(sql`${t.role} = 'recto'`),
  ],
)

export const objectPeople = pgTable(
  'object_people',
  {
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: personRoleEnum('role').notNull().default('given_by'),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.personId, t.role] }),
    index('object_people_person_idx').on(t.personId),
  ],
)

export const objectTags = pgTable(
  'object_tags',
  {
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.objectId, t.tagId] }), index('object_tags_tag_idx').on(t.tagId)],
)

/* ------------------------------------------------------------------ *
 * Grouping — one table behind clusters, shelves and saved filters
 * ------------------------------------------------------------------ */

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: collectionKindEnum('kind').notNull(),

    /** For `smart` collections: the stored predicate. */
    rule: jsonb('rule'),

    // Board cluster rect. Null for shelves and smart collections.
    boardX: real('board_x'),
    boardY: real('board_y'),
    boardW: real('board_w'),
    boardH: real('board_h'),

    /**
     * "DROP HERE TO FILE UNDER [TEXAS 2022][AUNT RUTH]" — dropping an object
     * into a cluster applies these. Tagging is the drag gesture.
     */
    impliedTags: jsonb('implied_tags').notNull().default(sql`'[]'::jsonb`),

    sortOrder: integer('sort_order').notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [index('collections_owner_kind_idx').on(t.ownerId, t.kind, t.sortOrder)],
)

export const collectionObjects = pgTable(
  'collection_objects',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.objectId] }),
    index('collection_objects_object_idx').on(t.objectId),
  ],
)

/* ------------------------------------------------------------------ *
 * Capture pipeline
 * ------------------------------------------------------------------ */

export const intakeBatches = pgTable(
  'intake_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: intakeSourceEnum('source').notNull().default('camera'),
    createdAt,
  },
  (t) => [index('intake_batches_owner_idx').on(t.ownerId, t.createdAt.desc())],
)

export const intakeItems = pgTable(
  'intake_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => intakeBatches.id, { onDelete: 'cascade' }),
    status: intakeStatusEnum('status').notNull().default('uploaded'),

    originalUrl: text('original_url'),
    cutoutUrl: text('cutout_url'),
    /**
     * The rest of what deriveFromOriginal produces.
     *
     * These existed on `object_faces` from the start but had nowhere to live in
     * between, so /api/derive returned them to the browser and dropped them: the
     * 640px thumbnail was written to Blob and paid for on every derive and then
     * referenced by nothing, and every object rendered at a fallback aspect
     * ratio because no face ever had real dimensions.
     */
    thumbUrl: text('thumb_url'),
    width: integer('width'),
    height: integer('height'),
    /**
     * What the camera recorded: capture date and coordinates.
     *
     * addIntakeItem has accepted an `exif` argument since phase 6 and had
     * nowhere to put it, so the date and GPS the uploader carefully reads off
     * every photograph were read and dropped — and the original is the only
     * place they exist, so re-deriving them means re-reading a 12 MB file.
     */
    exif: jsonb('exif'),
    /** Four points from edge detection, or dragged by hand. */
    corners: jsonb('corners'),
    ocr: jsonb('ocr'),
    /** { field: { value, confidence } } — renders as KIND … 98%. */
    suggestions: jsonb('suggestions'),

    objectId: uuid('object_id').references(() => objects.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (t) => [index('intake_items_batch_status_idx').on(t.batchId, t.status)],
)

/* ------------------------------------------------------------------ *
 * Sharing and activity
 * ------------------------------------------------------------------ */

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    scope: shareScopeEnum('scope').notNull().default('object'),
    objectId: uuid('object_id').references(() => objects.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('shares_owner_idx').on(t.ownerId, t.createdAt.desc())],
)

/**
 * Per-owner call counters for the endpoints that cost money or CPU.
 *
 * In the database rather than an in-process map or a regional cache, because a
 * serverless function has neither a process nor a region that outlives the
 * request — an in-memory limiter on Vercel resets on every cold start and is
 * per-instance besides, which is to say it is not a limiter.
 *
 * One row per owner per endpoint per hour window; the PK makes the increment an
 * upsert and old rows are swept opportunistically.
 */
export const apiUsage = pgTable(
  'api_usage',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'extract' | 'derive' — plain text, so a new endpoint needs no migration. */
    endpoint: text('endpoint').notNull(),
    /** Unix hour: floor(epochMs / 3_600_000). */
    window: integer('window').notNull(),
    calls: integer('calls').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.endpoint, t.window] })],
)

/** Only needed for the Ledger rail's "LAST ADDED / 2 DAYS AGO". */
export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: activityKindEnum('kind').notNull(),
    /** Polymorphic by design — no FK. */
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt,
  },
  (t) => [index('activity_owner_created_idx').on(t.ownerId, t.createdAt.desc())],
)
