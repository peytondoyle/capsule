# Handoff — 2026-07-27

Branch: **`v2-rebuild`** (not merged to `master`). Working tree committed.
Plan: [CAPSULE-V2-PLAN.md](CAPSULE-V2-PLAN.md) · Rules: [../CLAUDE.md](../CLAUDE.md)

**Phases 0–5 complete.** Phase 6 (capture) is in progress. One optional item left under
*Needs you* — the Clerk webhook, which nothing depends on.

Before doing UI work, reseed onto your own account so the Ledger is not empty:
sign in once, then `npm run db:seed -- --owner <your clerk user id>`. The archive currently
sits on a synthetic `user_seed_dev` row, which no signed-in session will ever match.

---

## Where things stand

| | |
|---|---|
| Repo | Single Next 16 app at root. `apps/`, `supabase/` deleted (recoverable at `4deef1e`). |
| Vercel | project `capsule` · `prj_6sLVlwcBGVtNtwXZjCL1C3kjBlTM` · team `peyton-doyle` |
| Neon | `capsule-db` · project `purple-river-19152863` · Postgres 17.10 · `us-east-1` / iad1 · free plan |
| Blob | `capsule-media` (public) `store_tCVSYcNtL8WVtWGV` · `capsule-originals` (private) `store_TJ3jyzfgZpJQro01` — both connected, all 3 envs |
| Clerk | app `Capsule` · `app_3H2m8Htunq84mjsLvOiAEnixExd` · dev instance `ins_3H2m8FLMWs9QFXpe7UfnbmtK57I` · `unified-polecat-6.clerk.accounts.dev` |
| Preview | https://capsule-mg2kfhg39-peyton-doyle.vercel.app (Vercel Authentication is on, so a plain `curl` gets 302/401 — that is protection, not a bug) |
| DB tables | 16 tables + 11 enums + pg_trgm. Migrations `0000`–`0002`. `npm run db:verify` runs 24 assertions. |

### Verified, with output

```
npm run build      exit=0      npm run typecheck  exit=0      npm run lint  exit=0
```

- **Blob round-trip** — `put` → `fetch` 200 with matching body → `head` → `del` → `fetch` 404.
- **Clerk webhook** — bad signature → 400 (fails closed); `user.created` → 200 and the row
  appears with email/name/avatar plus its `owner_counters` row; `user.updated` → 200;
  `user.deleted` → 200 and both rows gone via FK cascade. Driven by a locally-signed Svix
  payload against the real route.
- **Full auth chain** — custom sign-in → email code → session → `ensureUser()` →
  `users` + `owner_counters` rows. Used Clerk's `+clerk_test` fixture (fixed code `424242`)
  so no real mail was sent; the test user and its rows were deleted afterwards. Clerk and
  Neon are both back to **0 users**.
- **Deployed runtime** — `GET /api/health` on the preview returns
  `{"ok":true,"database":true,"node":"v24.18.0","region":"iad1"}`. Neon is reachable from the
  function, Node satisfies the driver's ≥19 requirement, and function and database sit in the
  same region.

### Not verified

- **Google OAuth.** Enabled on the instance with Clerk's shared dev credentials, and the
  button starts the redirect, but no round trip was completed. `/sign-in/sso-callback` exists
  and is untested.
- **Sign-in with a real mailbox.** Only the `+clerk_test` fixture path ran.
- **Anything on production.** There is one failed Production deployment from the first
  `vercel deploy` attempt (before `vercel.json` existed). Harmless — nothing was ever live —
  but the production URL is currently an error page until someone promotes a good build.

---

## Needs you

**1. ~~Connect `capsule-originals`~~ — done, via the API.** Recorded because the CLI cannot do it and the
next second-store will hit the same wall:

```bash
# the connection endpoint `vercel blob` does not expose
curl -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H 'content-type: application/json' \
  -d '{"projectId":"prj_…","envVarPrefix":"BLOB_ORIGINALS"}' \
  "https://api.vercel.com/v1/storage/stores/store_…/connections?teamId=team_…"
```

It targets Production and Preview only, so Development needs a manual mirror — and note that
`GET /v9/projects/{id}/env?decrypt=true` returns **ciphertext**, not the token. Use
`vercel env pull <file> --environment=preview`, which decrypts server-side, then
`vercel env add … development`.

Verified: `put` lands on `…private.blob.vercel-storage.com`, an anonymous fetch of that URL
returns **403**, and `del` cleans up.

**2. Register the Clerk webhook endpoint.** The Svix app exists; endpoint CRUD is not in
Clerk's Backend API, so this is a dashboard step. Get a fresh one-time dashboard link with:

```bash
clerk api /webhooks/svix_url -X POST --yes
```

Add an endpoint pointing at `<your-domain>/api/webhooks/clerk`, subscribe to `user.created`,
`user.updated`, `user.deleted`, copy the signing secret, then:

```bash
vercel env add CLERK_WEBHOOK_SIGNING_SECRET production
```

**This is genuinely optional.** `ensureUser()` creates the row synchronously on the first
authenticated request, so sign-up never depends on webhook delivery. Without the secret the
route returns 400 and only `user.updated` / `user.deleted` propagation is missing.

---

## Decisions made during phase 1 that differ from the plan

**Lazy `ensureUser()` is the guarantee; the webhook is only for updates and deletes.**
The plan's phase-1 proof was "a users row appears via webhook". That has a race: webhook
delivery is asynchronous and droppable, and every foreign key in the schema points at
`users.id`, so a delayed webhook means a signed-in user whose first write fails. `getCurrentUser()`
in [src/server/auth.ts](../src/server/auth.ts) does one indexed primary-key lookup and, only on
a miss, hydrates from Clerk's Backend API and upserts. The webhook still exists and is verified.

**Two Blob stores, not one namespace.** Access level turns out to be a property of the
*store*, not the blob: private stores serve from `{id}.private.blob.vercel-storage.com` behind
a bearer token, public ones from `{id}.public...`. So the plan's private-originals /
public-derivatives split needs two stores. Consequence for phase 6: originals go to
`capsule-originals` via `BLOB_ORIGINALS_READ_WRITE_TOKEN`, derivatives to `capsule-media`
via `BLOB_READ_WRITE_TOKEN`.

**Schema lives in `src/server/db/schema.ts`, not `drizzle/schema.ts`.** `drizzle/` holds
generated SQL only. The server-only boundary rule matters more than the folder name: keeping
every DB symbol under `src/server/` is what makes "never import drizzle outside `src/server/`"
mechanically checkable.

**Passwords are disabled on the Clerk instance.** Clerk created the app with
`auth_password.required: true`, which silently makes a passwordless flow uncompletable — the
sign-up sits at `missing_requirements` with `missingFields: ['password']` *after* the email is
verified, so it looks like a broken verify step. Patched with:

```bash
clerk config patch --json '{"auth_password":{"enabled":false,"required":false}}' --yes
```

Sign-in is now email code + Google only. Nothing in the app ever handles a password.

**Custom Clerk UI, not `<SignIn />`.** Per your mid-phase request. One unified flow at
[src/app/sign-in/page.tsx](../src/app/sign-in/page.tsx): a single email field tries
`signIn.emailCode.sendCode()` and falls through to `signUp.create()` when Clerk returns
`form_identifier_not_found`, so there is no sign-in/sign-up fork in the UI. `/sign-up`
redirects to `/sign-in`. Styled in the Ledger idiom inline — phase 3 refactors it onto the
real primitives, and [src/app/sign-in/cutout.tsx](../src/app/sign-in/cutout.tsx) is the
throwaway stand-in for `<Cutout>`.

---

## Serwist × Next 16 — plan risk #3, resolved

Tested and **not adopted**. Three findings, in order of how much they will bite:

1. `@serwist/next` injects a **webpack** config. Next 16 defaults to Turbopack and the build
   hard-fails: *"This build is using Turbopack, with a `webpack` config and no `turbopack` config."*
2. `next build --webpack` works — it emitted a valid 41 KB `public/sw.js`. So Serwist is
   usable, at the cost of leaving the default builder.
3. **The dangerous one:** adding `turbopack: {}` to silence (1) makes the build **succeed with
   no service worker at all**. Exit 0, no warning, no `sw.js`. A PWA that quietly stops being
   a PWA. Never silence that error.

Left the repo on Turbopack with Serwist uninstalled. Phase 11 picks one of:

- **A** — Serwist + `next build --webpack`. Simplest, gives up Turbopack permanently.
- **B** — hand-written `public/sw.js`, which is what Next's own PWA guide does. Keeps
  Turbopack; you implement background sync yourself and get no precache manifest.
- **C (recommended)** — keep Turbopack and compile `src/sw.ts` → `public/sw.js` with a
  standalone esbuild step in the build script. Keeps Serwist's runtime classes, including the
  `BackgroundSyncQueue` that offline capture depends on, without the webpack plugin.

---

## Pinned versions — do not "upgrade" these

Reasons in [../CLAUDE.md](../CLAUDE.md). All three were tested, not assumed.

- `typescript ~5.9.3` — TS 7.0.2 is `latest` but `typescript-eslint@8` (bundled by
  `eslint-config-next@16`) peers `typescript >=4.8.4 <6.1.0`. TS 7 compiles and breaks lint.
- `eslint ^9.39.5` — eslint 10 would clear 9 of 11 audit findings and every declared peer
  range allows it, but it crashes `eslint-plugin-react` in `getReactVersionFromContext`.
- `overrides.sharp ^0.35.3` — Next pins `^0.34.5`, whose libvips 8.17 carries
  CVE-2026-33327/33328/35590/35591. The override lands libvips 8.18.3. Phase 6 uses sharp directly.

Remaining `npm audit`: 11 findings, none actionable. `postcss` 8.5.23 is the newest published
version and is still flagged (npm's suggested "fix" is downgrading Next to 9.x);
`brace-expansion`/`minimatch` are dev-only DoS reachable only through the eslint plugin
chain's own globs.

---

## Phase 2, as built

14 tables, 11 enums, `pg_trgm` with 4 GIN indexes. Schema in
[src/server/db/schema.ts](../src/server/db/schema.ts); migrations `0000`–`0002`.

- **Lot allocation** runs on `drizzle-orm/neon-serverless` over a ws `Pool`
  ([src/server/db/pool.ts](../src/server/db/pool.ts)) because `neon-http` cannot hold a
  transaction open. The counter bump and the object insert commit together, so a failed
  insert cannot leave OBJ-0148 following OBJ-0146. Deleting an object *does* retire its lot
  for good — lots are never reused, so lot numbers and object counts drift apart by design.
- **`name_key`** is a generated `lower(name)` column on people/places/occasions/tags.
  The dedup has to be case-insensitive because intake writes into these constantly, and a
  generated column is the only form `onConflictDoUpdate` can target — an expression index
  is not addressable from drizzle's typed API.
- **Bug found and fixed**, which would have surfaced in phase 4: drizzle decides whether a
  left-joined group is null from its **first selected column**. `listTimeline` led with
  `cutout_url`, which is null for every object between intake and phase 6, so every face
  read as missing. The join now leads with `id`. Watch for this in any new left join.

`npm run db:verify -- --owner <id>` runs 21 assertions over the seeded archive — gapless
allocation under 12 concurrent inserts, counter rollback on failure, the unfiled predicate,
timeline ordering and face join, search reaching giver and place, and cross-owner isolation.

## Phase 3, as built

Everything lives in [src/design/](../src/design/), barrelled through `@/design`.
**[/design](http://localhost:3000/design)** is the gallery and the gate — `?surface=ledger|board|cabinet`
and `?section=silhouettes|cuts|states|type|fields|texture|capture|assemblies` isolate one
thing at a time.

- **`<Cutout>` is server-renderable.** The Ledger will put hundreds on a page and none of them
  need to ship as client components. Interactivity comes from `<TiltLayer>`, one delegated
  `pointermove` listener that finds `[data-sticker]` and composes the tilt onto the
  server-rendered base transform — which is exactly how the design doc's own script does it.
  Opt a cutout in with `interactive`.
- **Two orthogonal axes**, both persisted per object: `silhouette` (the outline of the thing)
  and `cut_style` (how it was trimmed). `full` deliberately ignores the silhouette — it is the
  honest "I didn't cut it out" state.
- **Measured against the doc, not eyeballed**: computed `filter` is
  `drop-shadow(rgba(52,42,26,.17) 0 10px 14px) drop-shadow(rgba(52,42,26,.14) 0 1px 1.5px)`,
  transition `transform .3s cubic-bezier(.2,.85,.25,1)`, hatch
  `repeating-linear-gradient(128deg,#dfd8c9 0 5px,#eae4d8 5px 10px)`, sticker padding 5px.
  All identical to `Capsule.dc.html`. Screenshots downscale enough to make the white edges
  look heavier than they are — measure before "fixing" anything.
- **Trap, now documented in CLAUDE.md**: aliasing surface colours inside Tailwind's `@theme`
  silently froze every surface to the Ledger palette, because a custom property is substituted
  where it is declared. The Cabinet rendered dark-on-cream and was invisible. The aliases are
  re-declared per `[data-surface]` block.
- Cabinet-specific: sticker edges are warm `#f4f0e6`, never pure white, and the shadow goes
  black at 50% rather than warm brown. Pure white blows out against `#151418` and the objects
  stop reading as paper.

The throwaway `src/app/sign-in/cutout.tsx` is gone; sign-in uses the real primitive. All
shipped pages now use tokens (`bg-bg`, `text-ink`, `border-hair`, `text-mute-*`) — the only
remaining literal hex is `layout.tsx`'s `theme-color` meta, which browsers cannot resolve from
a CSS variable, and Clerk's `appearance` object.

## Phase 4, as built

`/timeline` — rail, toolbar, year/month runs and the permanent inspector, all server
components. Selection lives in `?lot=`, so the inspector is server-rendered and every object
is deep-linkable; no client state at all on this screen.

- **Authed pages call `getCurrentUser()`, never `auth()` alone.** It also creates the `users`
  row. This surfaced for real: after signing in, the client-side push to `/` did not trigger a
  server render, so no row existed and seeding FK-failed. Any page that skips this renders an
  empty archive and then fails on the first object added.
- **`NULLS LAST` on the default-lot query.** Postgres sorts nulls *first* on `DESC`, so
  "newest received" handed back an undated, unfiled object and the Ledger opened on a row of
  em-dashes every time.
- Cutout widths come from each face's real aspect ratio (`src/design/sizing.ts`), which is
  what makes a run look hand-placed rather than gridded.
- The seed now clusters filler into a handful of months instead of smearing one per month
  across a decade. The Ledger is built around *runs*; one object per month reads as a list and
  the design falls apart. Worth remembering when generating any future fixture data.
- Not wired yet, deliberately: search, the NEWEST sort, and `+ ADD OBJECT` render as real
  controls because their absence changes the balance of the header, but search lands in phase
  10 and accession in phase 6.

## Phase 5, as built

`/o/[lot]` is the doc's phone screen, and stays a single column on desktop rather than
inventing a layout the design never specified. `?edit=1` swaps the body for a plain
`<form action={...}>` — no client JS on the save path at all.

- **Server Actions re-derive the owner from the session.** `requireOwner()` in
  `src/server/actions/objects.ts`, and every mutation that takes an object id calls
  `assertOwned` first. An action is a public endpoint; a caller passing an id is not evidence
  they own it. `db:verify` now asserts that a mutation with the wrong owner throws and writes
  nothing — 24 checks total.
- Only three client components on these screens: `<Faces>` (the recto/verso dots),
  `<Tags>` and `<RetentionControl>`. Both editors use `useOptimistic`, because a tag is a
  two-word thought and waiting on a round trip to see it appear is the difference between
  filing things and not bothering.
- Two rules encoded in the actions, not the UI: switching to "Only here now" **clears**
  `retained_location` (a shelf location for an object you no longer have is a lie), and
  clearing the date also resets `received_precision` to `unknown`, or the object claims a day
  it does not have and silently drops out of Unfiled.
- Shared editors live in `src/components/`, not under a route folder, since `/timeline`'s
  inspector uses the same two.

Verified signed in, with every path confirmed by querying Neon directly: tag add from both
the phone view and the inspector, the full field form (title, story, occasion — which created
and linked a new occasion without duplicating the dictionary, while preserving the giver,
place and date), and the retention toggle in both directions.

## Start of phase 6

The capture pipeline, and the real project inside the project. Ship it in the four stages the
plan lays out, each degrading cleanly to manual:

1. **Ingest** — client `upload()` straight to Blob, EXIF via `exifr` to prefill date and
   place. Do this first; it is the only stage that must never lose data.
2. **Corners** — ship the manual four-corner drag *before* the detector. `<ScanFrame>` is
   built and already has the handles; the doc says "DRAG A CORNER TO CORRECT", which means a
   mediocre detector is still a good experience.
3. **Derivatives** — a Node-runtime route with sharp. This is when
   `capsule-originals` needs connecting (see *Needs you*) and when `object_faces` URLs stop
   being null, so re-check anything that assumed the hatch placeholder.
4. **Extraction** — Claude vision with a structured-output tool, confidence per field. EXIF
   wins over the model on date and GPS.

`intake_batches` / `intake_items` are already in the schema with the right statuses.

## Things to clean up when convenient

- `src/app/page.tsx` is a phase-1 proof surface (SESSION / DB ROW / SYNCED AT). Phase 4
  replaces it with the real Ledger.
- `.claude/launch.json` runs the dev server for the preview pane; `npm run dev` on :3000.
- The failed Production deployment mentioned above.
