# Handoff — 2026-07-26

Branch: **`v2-rebuild`** (not merged to `master`). Working tree committed.
Plan: [CAPSULE-V2-PLAN.md](CAPSULE-V2-PLAN.md) · Rules: [../CLAUDE.md](../CLAUDE.md)

**Phases 0–2 complete**, except two steps only you can do (both under *Needs you* below;
neither blocks phase 3). Phase 3 is the design system.

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
| Blob | `capsule-media` (public) `store_tCVSYcNtL8WVtWGV` · `capsule-originals` (private) `store_TJ3jyzfgZpJQro01` ← **not connected**, see *Needs you* |
| Clerk | app `Capsule` · `app_3H2m8Htunq84mjsLvOiAEnixExd` · dev instance `ins_3H2m8FLMWs9QFXpe7UfnbmtK57I` · `unified-polecat-6.clerk.accounts.dev` |
| Preview | https://capsule-mg2kfhg39-peyton-doyle.vercel.app (Vercel Authentication is on, so a plain `curl` gets 302/401 — that is protection, not a bug) |
| DB tables | `users`, `owner_counters`, `drizzle.__drizzle_migrations`. One migration: `drizzle/0000_cute_jigsaw.sql`. |

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

**1. Connect `capsule-originals` to the project.** Vercel CLI 56.5.0 cannot do this: the
second Blob store on a project needs a custom env-var prefix, and only the dashboard offers
that field. `vercel blob create-store` has no `--prefix`, and OIDC will not authorize a store
that is not connected.

> Dashboard → Storage → `capsule-originals` → Connect to Project → `capsule` → set the env-var
> prefix to `BLOB_ORIGINALS_`, all three environments. Then `vercel env pull .env.local`.

Not needed until phase 6 (capture pipeline). Until then only the public `capsule-media` store
is wired, under the default `BLOB_READ_WRITE_TOKEN`.

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

## Start of phase 3

The design system, and the linchpin of the whole build. Order that works:

1. Tokens: the three `data-surface` palettes from the plan's §1 into `globals.css`, plus the
   self-hosted Inter / IBM Plex Mono fallbacks behind the SF stack.
2. `<Cutout>` first and carefully — everything else is downstream of it. All 7 silhouette
   presets × 4 cut styles × the two-layer `filter: drop-shadow`. `objects.silhouette`,
   `cut_style` and `rotation_deg` are already populated by the seed, so it has real input.
3. `<TiltSurface>` porting the doc's exact math: `perspective(800px)`,
   `rotateY(dx*13deg) rotateX(-dy*13deg) translateZ(6px)`, reset on `pointerleave`, gated on
   `prefers-reduced-motion`.
4. Then the rest: `<FieldRows>`, `<MonoLabel>`, `<Chip>`, `<RetentionToggle>`, `<Inspector>`,
   `<SheetPhone>`, `<ShelfRule>`, `<GrainSurface>`, `<StickerDeck>`, `<ScanFrame>`.
5. Gate: a `/design` gallery rendering every primitive × every surface × every state, diffed
   against the design doc.

[src/app/sign-in/cutout.tsx](../src/app/sign-in/cutout.tsx) is the throwaway stand-in and
should be deleted once the real primitive exists.

## Things to clean up when convenient

- `src/app/page.tsx` is a phase-1 proof surface (SESSION / DB ROW / SYNCED AT). Phase 4
  replaces it with the real Ledger.
- `.claude/launch.json` runs the dev server for the preview pane; `npm run dev` on :3000.
- The failed Production deployment mentioned above.
