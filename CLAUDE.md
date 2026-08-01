# capsule

**A personal archive of the objects people gave you.** Not a photo app. Each record is a
singular *object* — a boarding pass, a pressed fern, an enamel pin, a brass owl — that was
given to you by a *person*, at a *place*, on an *occasion*, and carries *a story*. You
either still physically have it or you don't.

Full spec, data model, and phase plan: **[docs/CAPSULE-V2-PLAN.md](docs/CAPSULE-V2-PLAN.md)**.
Read it before touching anything structural.

> **v1 was deleted, not migrated.** v1 was photo sharing (albums → members → photos,
> invites, Supabase RLS) against Supabase project `kjdoiozqefbjkbsimvbs`, which no longer
> exists. The SwiftUI iOS app is retired — PWA only. All of it is recoverable from git
> history at `4deef1e`; v1 planning docs are in `docs/archive/v1/`. Nothing in v1 is a
> reference for v2.

## Status

**All 12 phases built** and merged to `master`; production is live. The archive works end to
end: sign in → photograph → cut → file → Ledger/Board/Cabinet → share.

Still genuinely missing: the MAP tab, the Board hover card, web push, and a custom domain.
The Board phone sheet and filter rail shipped 2026-08-01. CATALOGUE, CLUSTER BY and edge
auto-detect are **not** deferred, whatever an older note says — all three are built.

`/design` is the design-system gallery and the phase-3 gate — every primitive, every
surface, every state. `?surface=ledger|board|cabinet` and `?section=…` isolate one at a time.

**Read [docs/HANDOFF.md](docs/HANDOFF.md) first.** It has the live resource ids and the per-site
status of the 2026-07-28 adversarial audit: **all 38 fixed as of 2026-08-01**, each mark
re-derived from the tree rather than remembered. The last one closed was the muted-token
contrast — a design decision: the muted scale was compressed, not collapsed (see tokens.css).

Two habits that doc records because they cost real time here: **a grep is not a fix** — a status
re-check twice reported a defect gone on the strength of a string match and was wrong both times —
and **green gates have twice certified a dead feature**, once when photo capture was entirely
broken in production and once when a sort control did not sort. Assert on what the page renders,
not on what the query returns.

## Stack

- **Next.js 16** App Router (Turbopack), React 19, TypeScript, Tailwind v4 (CSS-first)
- **Clerk** auth — `src/proxy.ts`, not the repo root (Next 16 renamed `middleware.ts` →
  `proxy.ts`). It is a bare `clerkMiddleware()`: it attaches the auth context and gates
  **nothing**. Every route and page guards itself with `getCurrentUser()`.
  **Sign-in is phone-only (SMS code) as of 2026-08-01** — email and Google are disabled in
  the instance config, by the owner's decision. The one instance serves dev *and* prod.
- **Neon Postgres** + Drizzle ORM (via Vercel Marketplace)
- **Vercel Blob** for originals + derivatives
- **PWA** — installable, offline capture, share target
- Single app at the repo root. **Not a monorepo.** No workspaces, no Turborepo.
  (v1's CLAUDE.md claimed Turborepo; there was never a `turbo.json`.)

## Verify

Run all three after every edit. Never report work as done without showing this output:

```bash
npm run build && npm run typecheck && npm run lint
```

`npm run dev` serves on :3000. **The preview config does not run it** — `.claude/launch.json`
runs `dev:verify`, which repoints the dev server at the Neon `verify` branch and refuses to
start without `DATABASE_URL_VERIFY`. It also has `autoPort`, so it takes any free port when
:3000 is busy; read the port out of the `preview_start` result rather than assuming 3000.

Database work: `db:generate` → `db:migrate` → `db:check`. `db:seed -- --owner <clerk id>`
fills an archive with the design doc's own fixtures. Five proof gates, all needing the
`react-server` condition their npm scripts set:

| | |
|---|---|
| `db:verify` | 33 · the data layer |
| `db:verify:p6` | 29 · the capture pipeline, the derive-persistence race, the rate limiter |
| `db:verify:upload` | 12 · the browser's client-upload path |
| `db:verify:desktop` | 39 · the Ledger sort as *rendered*, the inspector save, the Board actions |
| `db:verify:warp` | 11 · perspective geometry against synthetic ground truth. No DB, no Blob |

**The proof gates write.** `db:verify` allocates a dozen lots to prove the counter is
gapless; `db:verify:p6` uploads a photograph, files it as an object and deletes it again —
only ever the probe it created itself, never an item already waiting in someone's queue,
because a filed object's `object_faces` URLs *are* its intake row's URLs and the Blob stores
are shared.
`.env.local` and Production share one Neon endpoint, so both ran against the live archive
until the `verify` branch existed. `scripts/verify-db.ts` now repoints them at
`DATABASE_URL_VERIFY` and **refuses to run** without it (`--allow-prod` overrides). Recreate
the branch with `neonctl branches create --project-id $NEON_PROJECT_ID --name verify` and put
its pooled and direct URLs in `.env.local`. Blobs are *not* branched — p6 still writes to the
real stores under `intake/<owner>/probe-*` and cleans up after itself.

## Non-negotiable design rules

From the design source (Claude Design project `665e9737-ca19-4932-8725-f907669cb6fb`).
Violating these makes the app look wrong in a way no amount of polish recovers.

- **Prose is warm, data is archival.** Every date, count, id, dimension, field label, and
  percentage is mono, uppercase, letter-spaced (.06–.24em), `tabular-nums` — use `.mn`.
  Every title, story, and human sentence is sans with tight tracking.
- **Hairline rules, never boxes.** 1px at 8–14% ink. No bordered cards.
- **Every object is a die-cut cutout with a white sticker edge and a real shadow** — never a
  rectangle in a card.
- **Shadows use `filter: drop-shadow`, not `box-shadow`.** Only `filter` traces the
  `clip-path` silhouette instead of a bounding box. Two layers, `--lift` for the near one.
- **Rotation is persisted, never random at render.** `Math.random()` in a component
  reshuffles the whole archive on every navigation.
- Ledger / Board / Cabinet are three *surfaces*, not light/dark mode. They're selected by
  `data-surface` on `<main>`; each redefines the palette variables.

## Platform facts worth not rediscovering

- **Blob access level is a property of the store, not the blob.** Private stores serve from
  `{id}.private.blob.vercel-storage.com` behind a bearer token. So originals and derivatives
  need two stores: `capsule-originals` (private) and `capsule-media` (public).
- **Only one Blob store per project can use the default env var.** Connecting a second needs a
  custom prefix, which Vercel CLI 56.5.0 cannot set. Use the API:
  `POST /v1/storage/stores/{id}/connections {projectId, envVarPrefix}`. It only targets
  Production and Preview, and `?decrypt=true` on the env API returns ciphertext —
  `vercel env pull --environment=preview` is what actually decrypts.
- **Clerk instances default to `auth_password.required: true`**, which makes a passwordless
  flow uncompletable in a way that looks like a broken verify step (`missing_requirements`,
  `missingFields: ['password']`, *after* the email verifies). Disabled here; keep it that way.
- **Serwist injects a webpack config and cannot run under Turbopack.** Silencing the error
  with `turbopack: {}` makes the build succeed with **no service worker and no warning**.
  See the Serwist section of [docs/HANDOFF.md](docs/HANDOFF.md) before touching the PWA.
- **`drizzle-orm/neon-http` cannot do multi-statement transactions.** Lot allocation must use
  `neon-serverless` (ws `Pool`) — that is `getTxDb()` in `src/server/db/pool.ts`, its only
  caller being `createObject`. It connects on the **pooled** `DATABASE_URL`, deliberately:
  pgbouncer's transaction mode pins a server connection for the life of a transaction. No
  file under `src/` reads `DATABASE_URL_UNPOOLED` at all — only `scripts/verify-db.ts` and
  the `dev:verify` script, both of which *write* it.
- **Scripts importing `src/server/**` need `NODE_OPTIONS='--conditions=react-server'`**, or
  `import 'server-only'` throws outside Next.
- **Drizzle only qualifies interpolated columns when the query has a join.** In a join-less
  query `${objects.id}` renders as bare `"id"`, so inside a correlated subquery it binds to
  whatever inner table has an `id` — silently returning NULL for every row with no error.
  Prefer a real `leftJoin` over a correlated subquery, and when asserting on grouped output
  check for a *plural* group count, which is what catches this.
- **Blob `access` on the client `upload()` must match the store the token belongs to.** A
  mismatch fails *silently*: the PUT is never issued, nothing is logged, and the UI hangs on
  "uploading" forever. Originals are `private`, derivatives `public`.
- **`onBeforeGenerateToken` cannot rewrite the upload pathname.** `handleUpload` passes the
  *client's* pathname to the callback and then writes that same value into the issued token
  (`{...tokenOptions, pathname}` — @vercel/blob 2.6.1 `client.js`). Returning a `pathname` is
  a no-op, and it isn't in the callback's declared return type, so TS never objects. Ownership
  has to be enforced by **refusing** a pathname outside the owner's prefix, not by correcting
  it — see `src/lib/blob-path.ts` and the `db:verify:upload` gate, which exists because
  `db:verify:p6` seeds through the server-side `put()` and never exercised the browser path.
- **Derivatives are not alpha-masked.** The design system already clips every cutout with CSS,
  so baking the silhouette would duplicate it and make the stored image wrong the moment
  someone changes the cut style.
- **Derivatives are random-suffixed and never overwritten.** Deterministic keys with
  `allowOverwrite` were two bugs in one flag: a re-cut wrote a byte-identical URL the CDN served
  stale for 30 days, so the cut appeared to do nothing; and a dev session pointed at the
  production store could clobber live bytes in place. `/api/derive` deletes the previous pair
  only after the rows point at the new one. `thumbBesideCutout()` still understands the *old*
  deterministic layout, which every pre-2026-07-31 face has.
- **`sharp` cannot decode HEIC and never will here.** The bundled libheif ships the AV1 codec
  only — `sharp.format.heif.input.fileSuffix` is `['.avif']` — so every iPhone HEIC failed
  derive silently. It is a codec-licensing exclusion, not a version problem: upgrading sharp
  does not fix it. `src/lib/heic.ts` transcodes in the browser, on the device that has the
  codec. This also fixes the corner editor, whose `<img>` could not display a HEIC either.
- **sharp has no perspective transform.** `mapim` and `quadratic` are unbound and `affine()` is
  6 DOF — determined by three corners, parallelism-preserving, so the most general shape it maps
  a rectangle onto is a parallelogram. The homography in `src/server/warp.ts` is why
  "DRAG A CORNER TO CORRECT" is true. Recovering the *output aspect* is the subtle part: edge
  averaging is ~13% wrong at a 29° tilt, and the single-axis-tilt case needs the camera's EXIF
  focal length because the geometry alone is ambiguous there.
- **iOS has never supported Web Share Target** (WebKit bug 194593, still unassigned). The share
  target works on Android and ChromeOS only. The plan calls it the highest-leverage feature; on
  the platform this app targets it does nothing.
- **Next 16 does not emit `apple-mobile-web-app-capable`.** `appleWebApp.capable: true` emits
  `mobile-web-app-capable` instead, and iOS only shows the `startupImage` splash set when the
  Apple-prefixed tag is present — so all nine generated splash screens were dead until it was
  added by hand via `metadata.other`.
- **An in-memory rate limit is not a rate limit.** A serverless function has neither a process
  nor a region that outlives the request, so a counter in module scope resets on every cold
  start and is per-instance besides. `src/server/limits.ts` counts in Postgres.
- **Workers built by esbuild into `public/` cannot be imported by a route.** That is the point:
  `build:sw` and `build:detect` put the service worker and the 79 KB edge detector outside
  Turbopack entirely, so "the Ledger bundle must never import the detector" is a property of the
  build rather than something a CI check has to police.
- **`sharp` is a direct dep, with the override scoped to `next`.** A bare `overrides.sharp`
  clashes with a direct dependency (`EOVERRIDE`); both must stay ≥0.35.3 for libvips 8.18.
- **Never alias a surface colour inside Tailwind's `@theme`.** A custom property is
  substituted where it is *declared*, so `@theme { --color-bg: var(--bg) }` computes at
  `:root` and freezes every surface to the Ledger palette. The aliases are re-declared inside
  each `[data-surface]` block in `src/design/tokens.css` — see the comment there.
- **`@theme` still has to declare the colour keys**, or Tailwind never generates `bg-bg` /
  `text-ink` / `border-hair` at all. The literals in `globals.css` are placeholders.

## Data access — this replaces RLS

Supabase enforced ownership in the database. **Neon does not.** A single query missing its
owner filter is a cross-tenant leak.

- All DB access lives in `src/server/**`, which starts with `import 'server-only'`.
- Every data function takes `ownerId` as its **first parameter**. No exceptions.
- Never import `drizzle-orm` or `@neondatabase/serverless` outside `src/server/`.
- `auth.protect()` guards the resource (page / Server Action / Route Handler), not the proxy.
- **A Server Action is a public HTTP endpoint.** Re-derive the owner from the session inside
  every action (`requireOwner()` in `src/server/actions/`); never accept `ownerId` as an
  argument. Any mutation that takes an object id calls `assertOwned` first — a caller passing
  an id is not evidence they own it.
- Authed pages call `getCurrentUser()`, not `auth()` alone: it also creates the `users` row,
  and every foreign key points at it.

## Danger zones

- **Drizzle migrations** — `drizzle-kit push` against a real branch mutates data. Confirm first.
- **Blob deletes** — `del()` is permanent. Originals are the only copy of a user's memory.
- `drizzle-kit` and `tsx` do **not** read `.env.local`. Use
  `npx dotenv -e .env.local -- npx drizzle-kit push`.

## Pinned versions — do not "upgrade" these without checking

| Pin | Why |
|---|---|
| `typescript ~5.9.3` | `typescript-eslint@8` (bundled by `eslint-config-next@16`) peers `typescript >=4.8.4 <6.1.0`. TS 7 is `latest` but breaks `npm run lint`. |
| `eslint ^9.39.5` | eslint 10 crashes `eslint-plugin-react` inside `eslint-config-next@16` (`getReactVersionFromContext`). Verified, not assumed. |
| `overrides.sharp ^0.35.3` | Next pins `sharp ^0.34.5`, whose libvips 8.17 carries CVE-2026-33327/33328/35590/35591. The override lands libvips 8.18.3. Phase 6 uses sharp directly. |

**Accepted `npm audit` findings** (do not chase these):
`postcss` — 8.5.23 is the newest published version and is still flagged; no patch exists,
and npm's suggested "fix" is downgrading Next to 9.x. `brace-expansion` / `minimatch` —
dev-only DoS reachable only through the eslint plugin chain's own glob patterns; the fix
requires eslint 10, which is broken (above).

## Next.js

Next has breaking changes between majors. Check `node_modules/next/dist/docs/` before
assuming an API matches training data. Notably in 16: `middleware.ts` → `proxy.ts`,
Turbopack is the default builder, and `next lint` is gone (`npm run lint` calls eslint
directly).

## Subagents

Spawn an Explore subagent for any file search, grep, or broad codebase exploration — keeps
the main context window clean.
