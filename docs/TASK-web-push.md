# Task: web push

> ## ✅ DONE — shipped 2026-08-01 as `347eac0`. Do not implement this again.
> Migration `0006` is applied to both `verify` and `main`; VAPID keys and `CRON_SECRET` are
> on all three Vercel targets; `db:verify:push` passes 3 checks including the 410 pruning.
> **Delivery is still unproven** — there are zero subscriptions, so the cron is a live
> no-op. That is the one piece left, and it needs the owner's installed PWA.
>
> Kept for the traps below, which remain accurate.

Self-contained brief for an agent starting cold. Read [CLAUDE.md](../CLAUDE.md) first — the
data-access rules and platform traps there are binding. Unlike the hover card, **this one
touches the database, the service worker, and a secret**, so it is not presentation-only.

## State (verified 2026-08-01)

| | |
|---|---|
| Branch | `master`, clean, pushed — `aefc8ad` |
| Phase 8 (Board) | complete — filter rail, phone sheet, hover card all shipped |
| Latest migration | `drizzle/0005_watery_quasimodo.sql` — yours will be `0006` |
| `web-push` dependency | **not installed** |
| Push handler in `src/sw.ts` | **none** — 120 lines, offline shell + background sync only |
| App badging | already wired, `src/components/badge.tsx:14` |

## What to build

Two notifications, both of which the archive already knows how to count:

1. **"You have N unfiled"** — the nag. `countUnfiled(ownerId)` already exists.
2. **A share link was viewed** — `shares` rows already record the token.

Ship #1 first. #2 needs a view-counting hook that does not exist yet, so treat it as a
follow-up rather than blocking on it.

## The five pieces

**1. VAPID keys.** `npx web-push generate-vapid-keys`. Public key goes in
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private in `VAPID_PRIVATE_KEY`. Add both to `.env.local`
**and** to Vercel for all three targets. ⚠️ **Nothing syncs Vercel env vars any more** — the
Neon Marketplace resource was deleted 2026-08-01, so `vercel env add <k> <target> --force`
by hand, or extend `scripts/restore-vercel-env.sh` (do not assume a dashboard sync exists).

**2. A subscriptions table.** New table in `src/server/db/schema.ts`, then
`npm run db:generate` → `db:migrate` → `db:check`. Follow the existing conventions exactly:

```
id            uuid primary key default random
owner_id      text not null references users(id) on delete cascade
endpoint      text not null unique
p256dh, auth  text not null          -- the subscription keys
user_agent    text                   -- so a user can tell devices apart
created_at    timestamptz
```

One user has many devices. **Deleting a user must delete their subscriptions** — that is
what `on delete cascade` is for; `deleteUser` in `src/server/users.ts` should not need
changing, but verify it, because the account-delete path has already leaked a derivative
once (see the `thumbUrl` entry in HANDOFF.md).

**3. Server functions** in `src/server/push.ts`, starting with `import 'server-only'`:
- `subscribe(ownerId, subscription)` / `unsubscribe(ownerId, endpoint)`
- `sendToOwner(ownerId, payload)`

**Every function takes `ownerId` as its first parameter. No exceptions.** Neon has no RLS —
a query missing its owner filter is a cross-tenant leak. A Server Action is a public HTTP
endpoint: re-derive the owner from the session with `requireOwner()`, never accept an
`ownerId` argument.

**4. The service worker.** `src/sw.ts` is compiled by `build:sw` (esbuild, standalone —
**not** by Turbopack; see CLAUDE.md on why Serwist cannot run under it). Add:

```ts
self.addEventListener('push', (event) => { /* event.data.json() -> showNotification */ })
self.addEventListener('notificationclick', (event) => { /* focus or open the deep link */ })
```

Register them alongside the existing `install` and `fetch` listeners; keep
`serwist.addEventListeners()` last (line 120).

**5. Permission UI.** A quiet control in settings or the rail — never an on-load prompt.
Browsers permanently block a site that asks unprompted, and it cannot be undone from code.
Ask only after an explicit tap.

## Traps specific to this codebase

- **Dead subscriptions must be pruned.** A push to a revoked endpoint returns **410 Gone**
  (or 404). Delete that row when it happens, or the table fills with garbage and every send
  slows down. This is the single most common way a push implementation rots.
- **Do not put a send in a request path.** A serverless function has no process that
  outlives the request — see `src/server/limits.ts`, which counts rate limits in Postgres
  for exactly this reason. Fan-out belongs in a Cron Job or an explicit trigger.
- **iOS only delivers push to an *installed* PWA** (Add to Home Screen), 16.4+, and only
  after a user gesture. In Safari-the-browser it silently does nothing. Test on the home
  screen app, not a Safari tab. This mirrors the Web Share Target situation — see CLAUDE.md.
- **Never `Math.random()` in a component.** Not directly relevant here, but the rule holds.
- **`NEXT_PUBLIC_` means public.** Only the VAPID *public* key gets that prefix. Leaking the
  private key lets anyone push to your users.

## How to verify

**`/board` and every authed surface are gated behind phone-only SMS sign-in, which an agent
cannot complete.** Do not report this working on the strength of a green build — in this
repo a green gate has certified a dead feature twice.

What you *can* prove:

1. **A new proof gate.** Follow `scripts/verify-p6.ts`: create a subscription row, send to
   it, assert the row is pruned on a 410, then clean up **only what the script created**.
   Wire it in as `db:verify:push` with the `--conditions=react-server` NODE_OPTIONS the
   other gates set. `scripts/verify-db.ts` refuses to run without `DATABASE_URL_VERIFY`, so
   it will target the `verify` branch, not production.
2. **The service worker compiles and registers**: `npm run build:sw`, then confirm
   `public/sw.js` contains your push handler. The worker only registers in production
   builds.
3. **The permission UI** in `/design` — the public, un-gated gallery. Add a section the way
   `board-hover-card` was added: push a name into `SECTIONS` (`src/app/design/page.tsx:80`)
   and add one `{show('name') ? … : null}` block.

Then all three, output shown:

```bash
npm run build && npm run typecheck && npm run lint
```

Plus the existing gates, which must not regress:

```bash
npm run db:verify
npm run db:verify:desktop -- --owner user_seed_dev
```

(The `--owner` flag is required now — the verify branch holds two users.)

## Done means

- [ ] `0006` migration generated, migrated, `db:check` clean
- [ ] `src/server/push.ts` behind `server-only`, `ownerId` first on every function
- [ ] Subscribe / unsubscribe through a Server Action using `requireOwner()`
- [ ] `push` and `notificationclick` handlers in `src/sw.ts`, present in built `public/sw.js`
- [ ] 410/404 prunes the subscription row — **asserted in a gate, not assumed**
- [ ] Permission asked only on an explicit tap, never on load
- [ ] VAPID keys in `.env.local` and all three Vercel targets; only the public one is `NEXT_PUBLIC_`
- [ ] `db:verify:push` added and passing
- [ ] `build`, `typecheck`, `lint`, `db:verify`, `db:verify:desktop` all pass, output shown

## Out of scope

The MAP tab. Real-device delivery testing (needs the owner's phone). Share-view
notifications — land the unfiled nag first.

## Open for the owner, not the agent

- Generating VAPID keys is fine for an agent; **adding them to Vercel production** is a
  judgement call — confirm before writing to production env.
- Real push delivery can only be confirmed on Peyton's installed PWA. An agent can prove the
  plumbing, never the delivery.
