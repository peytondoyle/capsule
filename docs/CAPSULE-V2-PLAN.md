# Capsule v2 — Rebuild Plan

Source of truth for the design: Claude Design project `665e9737-ca19-4932-8725-f907669cb6fb`
("Memorabilia archive design directions"), files `Capsule.dc.html` + `support.js`.

Decisions locked:
- **All three directions ship as switchable view modes** (Ledger / Board / Cabinet) over one data model.
- **PWA only.** `apps/ios/` is retired (recoverable from git history).
- Auth = **Clerk**. DB = **Neon Postgres** (Vercel Marketplace). Files = **Vercel Blob**. Host = **Vercel**.

---

## 0. What the design actually is (and why this is a rewrite, not a revival)

Capsule v1 was *photo sharing*: albums → members → photos, with invites, join requests,
per-album roles and RLS. The design doc is a **personal memorabilia archive**: singular
*objects* (a boarding pass, a pressed fern, an enamel pin, a brass owl) that were *given to
you by a person*, at a *place*, on an *occasion*, with *a story*, and which you either
*still physically have* or don't.

Nothing in the v1 schema survives. `albums`, `album_members`, `album_invites`,
`join_requests`, `subsets`, `personal_metadata`, `notifications` are all deleted concepts.
Collaboration in v2 is: one owner + read-only share links. That is a deliberate scope cut,
not an oversight.

### The five fields, everywhere
The doc is explicit: *"Same five fields everywhere: who, when, where from, occasion, and
the story."* Every screen in all three directions renders exactly these, relabelled per
surface:

| Field | Ledger label | Cabinet label | Column |
|---|---|---|---|
| who | `FROM` | `GIVEN BY` | `object_people` where role = `given_by` |
| when | `RECEIVED` | `ACCESSIONED` | `objects.received_at` + `received_precision` |
| where from | `ORIGIN` | `PROVENANCE` | `objects.place_id` |
| occasion | `OCCASION` | `OCCASION` | `objects.occasion_id` |
| the story | `THE STORY` | `NOTE` | `objects.story` |

### The one state that isn't a field
*"Every direction carries a Still have it / Only here now state, since some of these
replace the physical object and some don't."* → `objects.retention ∈ {retained,
digital_only}` plus `objects.retained_location` free text (`"IN THE BLUE TIN, TOP SHELF"`).
Rendered as a segmented control on desktop, a green-dot pill on phone
(`#5b8c5a` on Ledger, `#7fae74` with glow on Cabinet).

### The typographic system is the whole system
*"SF Pro for everything you read, SF Mono for every piece of metadata (dates, lot numbers,
counts, field labels). That split is the whole typographic system: prose is warm, data is
archival."*

Hard rules, enforced in review:
- Any date, count, ID, dimension, field label, or percentage is **mono, uppercase,
  letter-spaced (.06–.24em), `tabular-nums`**.
- Any title, story, or human sentence is **SF Pro, tight tracking (-.01 to -.035em)**.
- **Hairline rules, never boxes.** 1px at 8–14% ink opacity. No bordered cards.
- **Every object is a die-cut cutout with a white sticker edge and a real shadow, never a
  rectangle in a card.**

---

## 1. Design tokens

Three surfaces, not "light/dark mode". The view switcher sets `data-surface` on `<main>`;
Cabinet is a *place*, not a theme.

```css
/* globals.css — Tailwind v4 CSS-first */
@import "tailwindcss";

@theme {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
               var(--font-inter), system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo,
               var(--font-plex-mono), monospace;
  --ease-capsule: cubic-bezier(.2, .85, .25, 1);
  --dur-capsule: 300ms;
}

[data-surface="ledger"] {
  --bg:#fbf9f5; --panel:#f6f3ed; --ink:#2a251d; --paper:#fff;
  --accent:#a8552b;              /* rust — unfiled, active meta, "Next" */
  --ok:#5b8c5a;
  --hair:rgba(42,37,29,.09); --hair-strong:rgba(42,37,29,.14);
  --mute-1:rgba(42,37,29,.72); --mute-2:rgba(42,37,29,.42); --mute-3:rgba(42,37,29,.35);
  --fill-a:#dfd8c9; --fill-b:#eae4d8;   /* placeholder hatch */
  --shadow-ink:52,42,26;
}
[data-surface="board"] {
  --bg:#e6dfd2; --panel:#fbf8f1; --ink:#2b2419; --paper:#fff;
  --accent:#b0741f; --ok:#5b8c5a;
  --hair:rgba(90,74,50,.14); --hair-strong:rgba(90,74,50,.24);
  --mute-1:#4a3f2c; --mute-2:#6c5d43; --mute-3:#8a7a5c; --mute-4:#a9906a;
  --fill-a:#ddd5c4; --fill-b:#e9e2d3;
  --shadow-ink:60,46,24;
}
[data-surface="cabinet"] {
  --bg:#151418; --panel:#1b1a1f; --ink:#eceae4; --paper:#f4f0e6;
  --accent:#c9a55f;              /* gold — lot numbers, scan line, awaiting entry */
  --ok:#7fae74;
  --hair:rgba(255,255,255,.07); --hair-strong:rgba(255,255,255,.12);
  --mute-1:rgba(236,234,228,.75); --mute-2:rgba(236,234,228,.4); --mute-3:rgba(236,234,228,.3);
  --fill-a:#c9c1b0; --fill-b:#d8d1c1;
  --btn:#e8e3d6; --btn-ink:#151418;
  --shadow-ink:0,0,0;
}
```

### Fonts
SF Pro / SF Mono are not webfont-licensable. Load the system stack first (native on Apple,
which is most of the audience) and self-host fallbacks via `next/font/local` so metadata
never reflows: **Inter Variable** for sans, **IBM Plex Mono** for mono. Fix v1's broken
wiring — `globals.css` currently declares `--font-geist-*` while `layout.tsx` loads Inter
as `--font-inter` and `body` hardcodes `Arial`.

### The silhouette vocabulary
Every cutout shape in the doc, as named presets. Store the chosen preset on the object so
the silhouette is stable across renders and matches what the user picked in `CUT STYLE`.

| Preset | CSS |
|---|---|
| `edge` | `border-radius:2px` |
| `card` | `border-radius:3px` |
| `ticket` | `clip-path:polygon(0 0,100% 0,100% 36%,95% 50%,100% 64%,100% 100%,0 100%,0 64%,5% 50%,0 36%)` |
| `polaroid` | `border-radius:2px` + `padding:7px 7px 26px` (bottom chin) |
| `circle` | `border-radius:50%` (1:1) |
| `blob` | `border-radius:50% 42% 55% 45% / 48% 58% 42% 52%` |
| `bust` | `border-radius:46% 46% 32% 32% / 34% 34% 12% 12%` |

`CUT STYLE` (a separate axis from silhouette, from the capture screen):
`EDGE` (flush) · `DIE-CUT` (3px+ white border, shadowed) · `LOOSE` (organic blob trim) ·
`FULL` (full frame + dashed outline offset).

### The shadow recipe
Two-layer, and on **`filter: drop-shadow`, not `box-shadow`** — that is the only way the
shadow traces the `clip-path` silhouette instead of a bounding box.

```css
.cutout { filter:
  drop-shadow(0 var(--lift, 10px) 14px rgba(var(--shadow-ink), .17))
  drop-shadow(0 1px 1.5px rgba(var(--shadow-ink), .14));
  transition: transform var(--dur-capsule) var(--ease-capsule);
}
.cutout[data-active] { transform: scale(1.02);
  filter: drop-shadow(0 16px 24px rgba(var(--shadow-ink),.22))
          drop-shadow(0 2px 3px rgba(var(--shadow-ink),.16)); }
.cutout[data-dragging] { transform: scale(1.05); z-index: 20; transition: none; }
```

`--lift` is a live token (the design doc exposes it as a `0–28px` range control, default
10). Keep it a CSS variable so it stays tunable; expose it in `/settings` as
"Shadow depth".

### Interaction physics, ported verbatim from the doc's script
- **Tilt** on `pointermove` over a cutout:
  `${base} perspective(800px) rotateY(${dx*13}deg) rotateX(${-dy*13}deg) translateZ(6px)`
  where `dx,dy` are pointer position within the element minus 0.5. Reset the base
  transform on `pointerleave`.
- **Drag** on `pointerdown` over a board cutout: strip any `perspective(...)` suffix from
  the base transform, set `transition:none`, `z-index:20`, `scale(1.05)`,
  `cursor:grabbing`; move by delta on `left/top`; restore base on `pointerup`.
- On phone, the mockup says **"tilt to catch the light"** — use `DeviceOrientation`
  (behind an explicit permission tap on iOS) rather than pointer.
- Every rotation is a small *persisted* jitter (`-6deg … +9deg`), seeded by object id.
  Never `Math.random()` at render — it would reshuffle on every navigation.
- All of the above is gated on `prefers-reduced-motion: no-preference`.

---

## 2. Data model (Drizzle / Neon Postgres)

No RLS. Every read and write goes through `src/server/**` functions that take an explicit
`ownerId` derived from Clerk. The DB client is never importable from a client component
(`import 'server-only'` at the top of `src/server/db.ts`).

```
users                 id (clerk user id, text PK), email, display_name, avatar_url,
                      created_at, updated_at
                      ← kept in sync by the Clerk webhook, NOT by a DB trigger

owner_counters        owner_id FK PK, next_lot int not null default 1
                      ← per-owner lot allocation; UPDATE ... RETURNING under the
                        ws Pool driver (neon-http cannot do transactions)

objects               id uuid PK
                      owner_id FK users
                      lot_no int not null                 -- "OBJ-0147" / "LOT 0147"
                      title text not null
                      kind text                            -- ticket_stub|postcard|polaroid|
                                                              photo|pressed_plant|pin|
                                                              matchbook|figurine|note|
                                                              fabric|coin|other
                      silhouette text default 'card'       -- preset table above
                      cut_style text default 'edge'         -- edge|die_cut|loose|full
                      rotation_deg real default 0           -- persisted jitter
                      received_at date
                      received_precision text default 'day' -- day|month|year|unknown
                      place_id FK places null
                      occasion_id FK occasions null
                      story text
                      retention text default 'retained'     -- retained|digital_only
                      retained_location text
                      material text                         -- "PAPER"
                      width_mm int, height_mm int           -- "78 × 210 MM"
                      board_x real, board_y real, board_z int  -- Board layout
                      created_at, updated_at
                      UNIQUE (owner_id, lot_no)

object_faces          id uuid PK, object_id FK, role text  -- recto|verso|detail
                      original_url text   (Blob, access:'private')
                      cutout_url  text    (Blob, public, alpha WebP)
                      mask_url    text    (Blob, public)
                      thumb_url   text    (Blob, public)
                      width int, height int, bytes bigint, mime text, dpi int,
                      exif jsonb, sort_order int
                      ← this is what powers "recto · verso →" and the 3 page dots

people                id uuid PK, owner_id FK, name, initials, avatar_url, note
object_people         object_id FK, person_id FK, role text  -- given_by|depicted|mentioned
                      PK (object_id, person_id, role)

places                id uuid PK, owner_id FK, name, lat double, lng double, kind
occasions             id uuid PK, owner_id FK, name
tags                  id uuid PK, owner_id FK, name         UNIQUE (owner_id, lower(name))
object_tags           object_id FK, tag_id FK   PK both

collections           id uuid PK, owner_id FK, name,
                      kind text                 -- cluster (Board) | shelf (Cabinet) | smart
                      rule jsonb                -- for smart collections
                      board_x, board_y, board_w, board_h real   -- cluster rect
                      implied_tags jsonb        -- "DROP HERE TO FILE UNDER [TEXAS 2022]"
                      sort_order int
collection_objects    collection_id FK, object_id FK, sort_order int  PK both

intake_batches        id uuid PK, owner_id FK, source text  -- camera|share_target|files
                      created_at
intake_items          id uuid PK, batch_id FK, status text
                      -- uploaded|segmented|extracted|needs_review|filed|skipped
                      original_url, cutout_url, corners jsonb,
                      ocr jsonb,          -- raw text + blocks
                      suggestions jsonb,  -- {field: {value, confidence}}
                      object_id FK null   -- set on file
shares                id uuid PK, owner_id FK, token text UNIQUE,
                      object_id FK null, collection_id FK null,
                      scope text, expires_at, created_at
activity              id uuid PK, owner_id FK, kind, target_id, metadata jsonb, created_at
                      ← only needed for "LAST ADDED / 2 DAYS AGO"
```

**Derived, not stored:** `is_unfiled` = no `given_by` person AND no `place_id` AND
`received_precision = 'unknown'`. Expose as a SQL view or a query helper. It drives the
rust `7` in the Ledger rail, the Board's "7 objects still unfiled", the Cabinet's
`SHELF III · 7 LOTS AWAITING ENTRY`, and the PWA app badge.

**Extensions:** `pg_trgm` with GIN indexes on `objects.title`, `objects.story`,
`people.name`, `places.name` — the doc has three different search boxes
("search 412 objects", "lot no., person, place"). Consider `pgvector` later for
"find the thing Nina gave me at the beach" semantic search; out of scope for v1.

**Driver split:** `drizzle-orm/neon-http` for ordinary queries;
`drizzle-orm/neon-serverless` (ws `Pool`) only for the lot-number transaction. Lazy
`getDb()` — **never a `Proxy` wrapper**, it breaks libraries that introspect the client.

---

## 3. Storage — where the blob is

**Vercel Blob** (`@vercel/blob@2.6.1`). This is the answer to the open question; it is
Vercel's first-party object store, billed on the same account, with automatic
latency-optimized delivery for thumbnails and volume-optimized delivery for originals.

```
objects/{ownerId}/{objectId}/{faceId}/original.{ext}    access: 'private'
objects/{ownerId}/{objectId}/{faceId}/cutout.webp       access: 'public'   (alpha)
objects/{ownerId}/{objectId}/{faceId}/mask.png          access: 'public'
objects/{ownerId}/{objectId}/{faceId}/t{320|640|1280}.webp  access: 'public'
```

- **Client uploads**, not server uploads: `upload()` from `@vercel/blob/client` against a
  `/api/blob/upload` token route. This is mandatory — a Vercel function body caps at
  4.5 MB and a HEIC burst from an iPhone blows straight through it. Client upload supports
  up to 5 TB and multipart.
- `addRandomSuffix: false` + explicit pathnames so URLs are deterministic and derivable.
- Originals stay **private** and are never served directly; a download goes through a
  proxy route that `get()`s the stream server-side after an ownership check.
- Derivatives are **public** — they're the hot path, they need CDN caching and
  `next/image`. Add `images.remotePatterns` for `*.public.blob.vercel-storage.com`.
- Use `unoptimized` on the alpha cutout WebPs: they are already exact-size with a
  transparent background, and re-encoding through the image optimizer risks flattening the
  alpha that `filter: drop-shadow` needs to trace the silhouette.
- Lifecycle: on object delete, `del()` every face path; on face replace, `del()` the old
  derivative set. A weekly cron reconciles Blob against `object_faces` and reports orphans.

---

## 4. Auth — Clerk

`@clerk/nextjs@7.6.1` on Next 16.

- **`proxy.ts`** at the project root (Next 16 renamed `middleware.ts` → `proxy.ts`):
  ```ts
  import { clerkMiddleware } from '@clerk/nextjs/server'
  export default clerkMiddleware()
  export const config = { matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ]}
  ```
  Note `/__clerk/(.*)` — required, and easy to miss. Note also the `webmanifest`
  exclusion, which matters for the PWA.
- **No `createRouteMatcher` gating in the proxy.** Clerk's current guidance is to protect
  the resource: `await auth.protect()` at the top of each protected page, Server Action,
  and Route Handler. `/s/[token]` and `/` stay public by simply not calling it.
- `<ClerkProvider>` in the root layout, `appearance` themed to the Ledger paper palette:
  `variables: { colorPrimary:'#2a251d', colorBackground:'#fbf9f5', colorText:'#2a251d',
  fontFamily:'var(--font-sans)', borderRadius:'7px' }`, plus `elements` overrides to
  replace Clerk's default card borders with hairlines.
- **`/api/webhooks/clerk`** using `verifyWebhook` from `@clerk/nextjs/webhooks`, handling
  `user.created | user.updated | user.deleted` → upsert/soft-delete the `users` row and
  seed `owner_counters`. This replaces v1's `handle_new_user` trigger — which, per the repo
  survey, **was never actually created by any migration**, so v1 would have failed on first
  signup anyway. Getting this right at the start is a real bug fix, not ceremony.
- Sign-in surface: the doc has no sign-in screen, so build one in the Ledger idiom — a
  single cutout on paper, hairline-ruled form, `+ CONTINUE` as a dark mono pill.

---

## 5. Screens

Eight artifacts exist in the design doc. Everything else is inferred and must match the
idiom.

### Ledger — `/timeline` (default post-auth)
- **198px left rail:** `CAPSULE` wordmark (mono, .22em) · `412 OBJECTS · 38 PEOPLE` ·
  nav rows with right-aligned mono counts (Timeline / People / Places / Occasions /
  **Unfiled** in rust) · `GIVEN BY` section with 21px initial-avatars (`#e7e0d3` on
  `#6d6355`) + per-person counts · footer `LAST ADDED / 2 DAYS AGO`.
- **56px toolbar:** search (`⌕ search 412 objects`), `NEWEST` sort pill, `+ ADD OBJECT`
  dark pill.
- **Body:** year header (`2022` 22px semibold + `38 OBJECTS · 6 PEOPLE` mono) over a
  hairline; month label (`APRIL`, mono .14em); a horizontal run of cutouts, each with a
  12px semibold caption and a mono `NINA · 09 APR` line. Baseline-aligned bottoms, varying
  widths, varying rotations.
- **322px right inspector, permanently present** (the doc calls it out explicitly): hero
  cutout on lighter paper, `OBJ-0147`, 19px title, four hairline field rows,
  `THE STORY` prose, `THE OBJECT ITSELF` segmented control + mono location line, tag chips
  with a dashed `+ TAG`.
- Grouping is **server-side** from `received_at` + `received_precision`. Unknown dates go
  to Unfiled, never into a fabricated month.

### Ledger phone — `/o/[lot]`
Nav `‹ / OBJ-0147 / ⋯` · hero cutout on a `#fbf9f5 → #f4f0e8` gradient · 22px two-line
title · mono `DAD · 12 NOV 2019 · LISBON` · story · retention pill with green dot and
`BLUE TIN, TOP SHELF` · tags · bottom bar `28 more from Dad / 2003 — 2024` + `SEE ALL`
(count and year range from that person's objects).

### Capture — `/accession`
Three steps, `Cancel / 2 OF 3 · CUT OUT / Next` with a 2px progress rule.
Hatched backdrop; detected cutout inside a dashed rust bbox with four square corner
handles; `EDGE FOUND AUTOMATICALLY / DRAG A CORNER TO CORRECT`; `CUT STYLE` picker
(EDGE / DIE-CUT / LOOSE / FULL) as four mini-swatch tiles.

### Board — `/board`
- Grain surface: `radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,.55), transparent 60%)`
  over two 26px `repeating-linear-gradient` grids at `rgba(90,74,50,.045)`, opacity driven
  by `--grain`.
- Dashed cluster rects (`1px dashed var(--hair-strong)`, fill `rgba(255,255,255,.22)`,
  16px radius) with a mono chip label above-left: `LISBON · NOV 2019 · 14`.
- Draggable cutouts. The dragged one goes `scale(1.06)`, heavy shadow, and grows a
  **hover card** to its right: title, mono meta, hairline, `DROP HERE TO FILE UNDER`, and
  the target cluster's implied tags — one filled, one ghosted. Corner label
  `DRAGGING · 1 OBJECT`.
- Floating top-center toolbar (`rgba(251,248,241,.94)` + `backdrop-filter: blur(12px)`):
  `Everything 412 ▾` | `SCATTER` | `TIDY` | `CLUSTER BY ▾` | `+ ADD`.
- Top-left `FILTER` stack: PEOPLE / PLACES / YEARS / KIND.
- Bottom-right zoom chip `62% | FIT`. Bottom-left `● 7 objects still unfiled · REVIEW`.
- **Mechanics:** pan/zoom = one CSS transform on a single layer, hand-rolled pointer
  handling (no library needed). Viewport persisted to `localStorage`. Layout persisted to
  `objects.board_{x,y,z}` on drag end via a debounced Server Action. `TIDY` = server-side
  grid pack respecting cluster rects; `SCATTER` = jitter **seeded by object id** so it is
  deterministic and survives reload. `CLUSTER BY` groups server-side and bin-packs new
  cluster rects, then animates cutouts to their targets. Drop-to-file = hit-test the
  pointer against cluster rects on `pointerup` and apply that cluster's `implied_tags` —
  *tagging is the drag gesture*, which is the whole point of this direction.
- 412 objects renders fine unvirtualized; add viewport culling and
  `content-visibility:auto` above ~1500.

### Board phone
Grain, scattered cutouts, cluster chip, and a 296px bottom sheet: 38px drag handle, mini
cutout + title + mono meta, story, tags, and two 44px actions — `Peel & move` (outline) and
`Open` (dark fill). "Peel" gets its own transition: translate + rotate + shadow bloom.

### Batch tagging queue — `/queue`
`Done / 4 OF 19 UNFILED / Skip`. A three-layer card deck (back layers at
`rotate(6deg) scale(.92) opacity(.5)` and `rotate(-3deg) scale(.96) opacity(.75)`).
Then the instruction that defines the whole flow:
**`TAP WHAT'S TRUE. THE REST CAN WAIT.`**
A people chip row (`+ SOMEONE` dashed), hairline, a place/date/occasion chip row, then
`WHY IT MATTERS · OPTIONAL` with placeholder *"Say one sentence and move on…"*.
Footer: 44px `⌂` + `File it · 15 left`.
Chips are pre-filled from extraction; tapping confirms. Nothing is required.

### Cabinet — `/cabinet`
- 56px dark top bar: `CAPSULE` (.24em) | tabs `CABINET / CATALOGUE / PEOPLE / MAP` |
  search `⌕ lot no., person, place` | `+ ACCESSION` as a light `#e8e3d6` pill.
- Shelves: `SHELF I` (mono .18em) + name + right-aligned `14 LOTS`; a row of cutouts on
  `#f4f0e6` paper against the dark; `+ 9 MORE →`; then the shelf light —
  a 1px gradient rule `transparent → rgba(255,247,228,.55) → transparent` with
  `box-shadow: 0 0 14px rgba(255,240,205,.28)`, followed by a 26px downward glow gradient.
  This is the signature move; get it exactly right.
- `SHELF III · Unattributed · 7 LOTS AWAITING ENTRY` in gold, whole row at `opacity:.55`.
- 344px right panel: hero cutout with `recto · verso →`, `LOT 0147` in gold +
  `PAPER · 78 × 210 MM`, 20px title, four field rows, `NOTE`, and a footer with the glowing
  green dot + `Physical object retained` + `BLUE TIN`.
- **Shelves are `collections` of kind `shelf`.** `MAP` tab is MapLibre GL over a
  Protomaps/CARTO basemap restyled monochrome — schedule it late; it is the one screen with
  an external dependency and a potential tile bill.
- `78 × 210 MM` needs a dimensions source. v1: optional manual entry in the inspector.
  Do **not** fake it.

### Cabinet phone — lot view
Dark, gold `LOT 0147`, hero at `rotate(-2deg) perspective(700px) rotateY(-6deg)` with
`tilt · turn over`, three page dots (recto / verso / detail, first one gold), then a
`#1b1a1f` sheet: 23px two-line title, gold mono meta, note, retention row,
`Edit entry` | `Next lot ›`. The flip is a CSS 3D `rotateY(180deg)` with
`backface-visibility:hidden` across two `object_faces`.

### Cabinet phone — accession (scan)
`Close / ACCESSION / FLASH`. Dark camera view over a diagonal-stripe backdrop; a gold
horizontal scan line with a 22px glow; a gold bbox with four corner brackets;
`EDGES LOCKED · HOLD STILL` / `READING TEXT ON THE FACE…` in gold.
Results sheet: `READ FROM THE OBJECT · CONFIRM OR CHANGE`, then hairline rows carrying
**confidence percentages** — `KIND Ticket stub 98%` · `PLACE The Fillmore, SF 91%` ·
`DATE 14 JUN 2023 88%` · `FROM Who gave it to you?` (empty, because no machine can know
that). Footer `⟲` + `Accession · lot 0413`.

---

## 6. The capture pipeline (the hardest part — treat as its own project)

This is where the design lives or dies. Split into four independently shippable stages;
each stage must degrade to "manual" cleanly.

**6a — Ingest.** Camera / file input / Web Share Target. Upload original bytes to Blob
**unmodified** via client `upload()`. Read EXIF with `exifr` immediately → prefill DATE and
PLACE before any model runs. Never lose the original: everything downstream is derived and
recomputable. iOS Safari hands you HEIC; store it as-is and convert server-side.

**6b — Edge detection + perspective correction.** OpenCV.js in a **Web Worker**, behind a
dynamic import scoped to `/accession` only (it is a multi-MB wasm payload — it must not
touch the Ledger bundle). Grayscale → blur → Canny → `findContours` → largest convex
4-gon → order corners → `getPerspectiveTransform` + `warpPerspective`. Output four corner
points into `intake_items.corners`. **The manual 4-corner drag is the primary path, not the
fallback** — the design already says "DRAG A CORNER TO CORRECT", so a mediocre detector is
still a good UX. Ship the manual handles first, then the detector.

**6c — Derivatives.** A Node-runtime route with `sharp`: HEIC→WebP, apply the warp, apply
the silhouette mask, emit an **alpha** cutout WebP plus 320/640/1280 thumbs, and write them
all to Blob. For `LOOSE`/`DIE-CUT` on three-dimensional objects (the brass owl, the pin) you
need real matting, not a polygon: use `@imgly/background-removal` client-side (wasm, no API
cost, big model download — lazy and cached) with a server fallback. For flat paper — which
is most of the corpus — the 4-gon warp *is* the cutout and no matting is needed. Route by
`kind`.

**6d — Extraction.** A server route calling **Claude with vision and a structured-output
tool** (`claude-sonnet-5`) returning `{kind, title, place, date, occasion, tags}` where each
field carries a `confidence` in `0–1`. That maps 1:1 onto the design's `98% / 91% / 88%`.
Merge with EXIF-derived values (EXIF wins on date/GPS — it's ground truth). `FROM` is never
guessed; the design deliberately leaves it as a question, and so should we.
Rate-limit per user; cache by content hash so re-scans are free.

---

## 7. PWA — "confident" means these seven things

1. **`app/manifest.ts`** — `display:'standalone'`,
   `display_override:['window-controls-overlay','standalone']`,
   `start_url:'/timeline'`, `id:'/'`, `background_color:'#fbf9f5'`, 192/512 + 512
   maskable icons, `screenshots` with both `form_factor:'wide'` and `'narrow'` (this is what
   unlocks the rich install card), `categories`, `orientation:'any'`.
2. **`share_target`** — `POST`, `multipart/form-data`, action `/accession/share`,
   accepting `image/*`. This is the single highest-leverage native-feeling feature: the OS
   share sheet gains "Capsule", and adding an object becomes two taps from Photos. Also
   register `file_handlers` for `image/*`.
3. **`shortcuts`** — Accession · Unfiled queue · Board. Long-press the home-screen icon.
4. **Offline capture that actually works.** IndexedDB (`idb`) holds queued blobs + draft
   fields; a Serwist `BackgroundSyncQueue` flushes accession POSTs when connectivity
   returns. Pending objects render as cutouts with a **dashed edge** (reusing the `+ TAG`
   chip's visual language for "not real yet"). This is the difference between a website and
   an app: you can photograph twenty things in a basement with no signal.
5. **Caching strategy** — Serwist 9.5.12 (`@serwist/next`, peer range `next >=14`, so 16 is
   in range but needs a smoke test; the hand-written `sw.js` from Next's own PWA guide is the
   fallback). App shell precached; `StaleWhileRevalidate` for object list JSON;
   `CacheFirst` + expiration for `*.blob.vercel-storage.com` derivatives (they're immutable);
   `NetworkOnly` + background sync for mutations.
6. **Install + iOS parity** — capture `beforeinstallprompt` and surface a custom
   "Add to Home Screen" affordance styled as a sticker. iOS never fires that event, so ship
   an instructional sheet for Safari. `appleWebApp: { capable:true, title:'Capsule',
   statusBarStyle:'black-translucent' }` + generated per-device startup images.
   `viewport: { viewportFit:'cover', interactiveWidget:'resizes-content', themeColor:
   [{media:'(prefers-color-scheme:light)',color:'#fbf9f5'},{media:'(prefers-color-scheme:dark)',color:'#151418'}] }`
   — `viewportFit:'cover'` plus `env(safe-area-inset-*)` is what makes the phone mockups'
   notch and home-indicator spacing actually correct.
7. **Badging + push** — `navigator.setAppBadge(unfiledCount)` so the rust `7` lives on the
   home screen. Web Push with VAPID for share-link views and "you have 19 unfiled". Note:
   iOS 16.4+ only delivers push to **installed** PWAs, which is another reason (1)–(6)
   matter.

Plus `Screen Wake Lock` during batch accession — nobody wants the screen dying mid-scan.

---

## 8. Rendering & data-flow strategy (Next 16)

- **Server Components for every read.** Server Actions for every mutation. No TanStack
  Query — `useOptimistic` + Server Actions covers the interaction model, and the only real
  client state is Board drag/viewport (a tiny Zustand store or plain `useRef`).
- **Cache Components:** everything owner-scoped is private, so `use cache` +
  `cacheTag(\`objects:\${ownerId}\`)` and `updateTag` after mutations. The genuine PPR win is
  `/s/[token]` public share pages — fully prerenderable, CDN-cached, no auth.
- `next.config.ts`: remove v1's `eslint.ignoreDuringBuilds: true` (lint should gate the
  build), add `images.remotePatterns` for Blob, keep `sharp` server-external.
- Node 22 (`engines`), because `@neondatabase/serverless` requires Node 19+.

---

## 9. Repo restructure

```
DELETE   apps/ios/                      (retired; recoverable from git history)
DELETE   apps/ios/build/                (committed Xcode DerivedData — never gitignored)
DELETE   supabase/                      (schema, migrations, config.toml)
DELETE   apps/web/.vercel/              (stale project id; that Vercel project is gone)
DELETE   apps/web/src/lib/supabase/, src/stores/authStore.ts, src/types/database.ts
ARCHIVE  PLAN.md, PRD.md, docs/PRD.md → docs/archive/v1/
MOVE     apps/web/* → repo root         (single app; drop the npm-workspaces indirection)
REWRITE  CLAUDE.md                      (v1 claims Turborepo — there is no turbo.json)

ADD      drizzle/{schema.ts,migrations/}
ADD      src/server/**                  ('server-only'; all DB access, ownerId-scoped)
ADD      src/design/{tokens.css,primitives/}
ADD      src/app/{timeline,board,cabinet,accession,queue,people,places,o,s,settings}/
ADD      src/app/{manifest.ts,api/}
ADD      proxy.ts                       (Clerk; Next 16 renamed middleware.ts)
ADD      sw.ts, public/icons/, public/splash/
```

Env vars: `DATABASE_URL` · `BLOB_READ_WRITE_TOKEN` ·
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` · `CLERK_SECRET_KEY` ·
`CLERK_WEBHOOK_SIGNING_SECRET` · `ANTHROPIC_API_KEY` ·
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` · `NEXT_PUBLIC_APP_URL`.

Note: `drizzle-kit` and `tsx` do **not** read `.env.local`. Use
`npx dotenv -e .env.local -- npx drizzle-kit push`.

---

## 10. Phases

Each phase ends with `npm run build && npm run typecheck` green, and its own stated proof.

| # | Phase | Deliverable | Proof |
|---|---|---|---|
| 0 | ~~**Decommission & scaffold**~~ ✅ | Deletions above; fresh Next 16 + React 19 + TS + Tailwind v4 app at root; `engines: node>=22` | ✅ `build` / `typecheck` / `lint` all exit 0; page renders with no console errors |
| 1 | ~~**Platform wiring**~~ ✅ | New Vercel project (`vercel link`); `vercel integration add neon`; Blob store; Clerk app + `proxy.ts` + `<ClerkProvider>` + webhook | ✅ see [HANDOFF.md](HANDOFF.md) — auth chain, webhook, Blob round-trip and deployed DB reachability all verified. Two dashboard-only steps outstanding, neither blocking. |
| 2 | ~~**Schema + data layer**~~ ✅ | Drizzle schema, first migration, `pg_trgm` + GIN indexes, `owner_counters` + lot allocation, `src/server/**` query fns, seed script (~40 objects, 6 people, 5 places) | ✅ `db:check` clean; 40 objects seeded; `npm run db:verify` — 21 checks, incl. gapless allocation under 12 concurrent inserts and rollback on failure |
| 3 | ~~**Design system**~~ ✅ | Tokens for all three surfaces; fonts; `<Cutout>` + `<TiltLayer>` + `<FieldRows>` + `<MonoLabel>` + `<Chip>` + `<RetentionToggle>` + `<Inspector>` + `<SheetPhone>` + `<ShelfRule>` + `<GrainSurface>` + `<StickerDeck>` + `<ScanFrame>`; all 7 silhouettes | ✅ `/design` with `?surface=` and `?section=` filters; shadow, easing, hatch and padding measured equal to the doc; all three palettes verified in-browser |
| 4 | ~~**Ledger**~~ ✅ | `/timeline` full desktop: rail, toolbar, year/month grouping, cutout runs, live inspector | ✅ verified signed-in against a seeded archive — rail 198px / inspector 322px measured, undated objects stay out of the months, unfiled reads 7, selection round-trips via `?lot=` |
| 5 | ~~**Object detail**~~ ✅ | `/o/[lot]` phone + desktop; faces (recto/verso/detail); edit via Server Actions; retention toggle; tags | ✅ every edit path round-tripped to Neon and confirmed by query; person-stats footer computes; `db:verify` now 24 checks incl. cross-owner write rejection |
| 6 | ~~**Capture pipeline**~~ ✅ | ingest+EXIF → manual corner editor → sharp derivatives → Claude extraction (auto-run after upload) | ✅ `db:verify:p6` 14 checks; extraction verified on prod: ticket_stub/title/place/date all 95%, FROM absent by design. Deferred: OpenCV auto-detect (manual is primary per the doc) |
| 7 | **Queue** ◐ | `/queue` batch tagging; `TAP WHAT'S TRUE`; deck; skip/file; unfiled count everywhere incl. app badge | ◐ screen built and files real items; app badge and the 90-second timing still to do |
| 8 | **Board** ◐ | Pan/zoom, drag+persist, clusters w/ drop-to-tag, SCATTER/TIDY, zoom chip, unfiled chip | ✅ core verified (drag persists, drop applies tags, tidy idempotent — `db:verify` 28 checks). Deferred: CLUSTER BY, filter rail, hover card, phone sheet |
| 9 | **Cabinet** ◐ | Shelves + shelf light, lot numbering, gold system, 344px panel, ?lot= selection, implicit Elsewhere + dimmed Unattributed shelves | ✅ screenshotted against `1c`: shelf light + bloom, gold lots, GIVEN BY/PROVENANCE, glowing retention dot. Deferred: CATALOGUE/MAP tabs, verso flip animation, dark scan chrome (accession is shared) |
| 10 | **Index screens** ◐ | People / Places / Occasions / live search on `?q=` from both the Ledger toolbar and the Cabinet box | ✅ search verified: lot no., person, place, occasion and free text; person page shows the year-range runs. Deferred: `CATALOGUE` table view |
| 11 | **PWA** ◐ | Manifest w/ share target + shortcuts, generated icon set, esbuild-compiled Serwist worker (option C — Turbopack stays), offline IDB upload queue, background-sync for derive/extract, app badging, apple metadata | ✅ manifest/worker/icons all serve; worker registers in prod only. Deferred: install affordance UI, iOS splash images, web push, real-device airplane test |
| 12 | **Share, polish, ship** | `/s/[token]` public pages (PPR), reduced-motion audit, keyboard nav, focus rings in all 3 surfaces, prod deploy + domain | Prod deploy; share link opens for a signed-out visitor; axe clean |

---

## 11. Risks, ranked

1. **Cutout quality is the product.** A bad silhouette makes every screen look wrong, and
   there is no design left if the objects are rectangles. Mitigation: manual corner drag
   ships in phase 6 *before* auto-detection; matting is opt-in by `kind`; the `FULL` cut
   style is always an honest escape hatch.
2. **OpenCV.js / background-removal wasm bundle weight.** Multi-MB payloads. Mitigation:
   Web Worker + dynamic import scoped to `/accession`; the Ledger route must never
   transitively import them — add a bundle-size check in CI.
3. **Serwist × Next 16.** Peer range allows it (`next >=14`) but it isn't proven here.
   Mitigation: smoke-test in phase 1, not phase 11; the hand-written `sw.js` from Next's own
   PWA guide is a known-good fallback.
4. **iOS Safari PWA gaps.** No `beforeinstallprompt`, push only when installed, HEIC
   everywhere, aggressive storage eviction. Mitigation: instructional install sheet;
   server-side HEIC conversion; `navigator.storage.persist()`; never treat IndexedDB as
   durable — Blob is the source of truth the moment bytes land.
5. **No RLS anymore.** Supabase enforced ownership in the database; Neon will not. A single
   query missing its `ownerId` filter is a cross-tenant leak. Mitigation: **all** DB access
   behind `src/server/**` with `import 'server-only'`, every function taking `ownerId` as its
   first parameter, an ESLint boundary rule forbidding `drizzle`/`neon` imports outside
   `src/server/`, and a test that asserts a second user cannot read the first's objects.
6. **Extraction cost and latency.** A vision call per intake item. Mitigation: cache by
   content hash, per-user rate limit, and make extraction fully optional — `TAP WHAT'S TRUE.
   THE REST CAN WAIT.` is a design that works with zero machine assistance.
7. **Board performance at scale.** Mitigation: single transform layer, viewport culling,
   `content-visibility:auto`, drag on `left/top` of an absolutely-positioned layer with
   `transition:none` while dragging (already the doc's approach).
8. **Three shells is 1.6× the v1 scope.** Mitigation: phases 8 and 9 are presentation over
   identical queries; if time runs out, Ledger alone is a complete product and the view
   switcher simply shows fewer options.

---

## 12. Deliberately out of scope for v1

Multi-user collaboration and roles · comments and likes · realtime · video · the `MAP` tab
(phase 10 at the earliest) · semantic/vector search · physical dimension auto-measurement ·
native iOS · print/export.
