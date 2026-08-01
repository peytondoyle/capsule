# Handoff — 2026-08-01

Supersedes the 2026-07-31 handoff, whose bulk was the per-site status of the 2026-07-28
adversarial audit. That audit is **closed, 38 of 38**; the per-site detail lives in git
(`3fe718d`, `24d8858`, `9e20707`) and the traps worth keeping were distilled into
[CLAUDE.md](../CLAUDE.md). Read CLAUDE.md first — it is the durable document; this one is
state.

## State

| | |
|---|---|
| Branch | `master` @ `f37c877`, clean, **0 unpushed** |
| Untracked, undecided | `AGENTS.md`, `docs/design-directions/` |
| Production | `capsule-dmmi6ejn0`, aliased to `capsule-omega-ruby.vercel.app`, `{"ok":true,"database":true}` |
| Deployed vs committed | **matches** — `347eac0` is the last code commit; `f37c877` is docs-only |
| Neon | project `old-math-03360848`, **personal** org `org-restless-flower-66125015` |
| Latest migration | `0006_daily_vindicator` — applied to `verify` **and** `main` |

Row counts, read from the databases on 2026-08-01:

| branch | tables | objects | users | shares | push_subscriptions |
|---|---|---|---|---|---|
| `main` (production) | 18 | 41 | 2 | 1 | **0** |
| `verify` | 18 | 81 | 2 | 1 | 0 |

Production's 41 objects are 40 `user_seed_dev` fixtures plus **one real object** belonging to
`p6doyle@gmail.com`. Only that one has real Blob bytes behind it.

Proof gates, all run and passing on 2026-08-01 (counts measured, not remembered):

| gate | checks | covers |
|---|---|---|
| `db:verify` | 33 | the data layer, gapless lot allocation |
| `db:verify:p6` | 29 | capture pipeline, derive-persistence race, rate limiter |
| `db:verify:upload` | 12 | the browser's client-upload path |
| `db:verify:desktop` | 39 | Ledger sort as *rendered*, inspector save, Board actions |
| `db:verify:warp` | 11 | perspective geometry vs synthetic ground truth |
| `db:verify:push` | 3 | subscribe, cross-tenant isolation, 410 pruning |

⚠️ **`db:verify:desktop`, `db:verify:push` and `db:verify:p6` now require
`-- --owner user_seed_dev`.** The verify branch holds two users since 2026-08-01, and the
gates refuse to guess. Without the flag they exit 1 before running a single check — which
looks like a failure and is not.

## What changed — 2026-08-01

**The archive is now usable on a phone.** Ledger, Cabinet and Catalogue had no phone layout
at all; they were fixed three-column desktop anatomies crushed into 402 points. Now
mobile-first with `lg:` desktop overrides, the `/o/[lot]` idiom. Both Inspectors hide below
`lg` and a shared server-rendered `PhoneLotSheet` rises instead — one component, palette
correct on each surface through the `data-surface` cascade. The Catalogue keeps
LOT · OBJECT · ACCESSIONED · KEPT and drops the middle three columns.

**Phase 8 is complete.** The Board gained its filter rail (PEOPLE/PLACES/YEARS/KIND,
client-side over facets `getBoard` now carries), its phone sheet (tap a cutout on a coarse
pointer → 296px sheet, Peel & move / Open), and its hover card (follows the drag, flips left
at the canvas edge, shows the target cluster's implied tags one filled one ghosted). No
deferrals remain on that phase.

**Sign-in is phone-only.** Email and Google are disabled in the Clerk instance; `phone_code`
is the only first factor. The owner's number is attached to their existing user, so it lands
in the real archive rather than minting a duplicate.

**The muted scale was redesigned, closing the audit.** `--mute-2`/`--mute-3` carried every
date and label at 2.48:1 and 2.08:1. The audit's suggested fix equalled `--mute-1`, which
would have collapsed three levels into two — so the whole scale was compressed instead:
Ledger 0.87/0.76/0.67, Board `#4a3f2c`/`#5a4c35`/`#6c5d43`, Cabinet 0.75/0.62/0.52. Every
step clears 4.5:1 on its worst ground; the maths is commented in `tokens.css`.

**The database left the Vercel-managed Neon org.** See "Working notes" — this one has
consequences that outlive the migration.

**Web push shipped, and has never delivered a notification.** See below.

## In flight

Nothing. No branch, no stash, no partial work. The two stale branches
(`feat/edit-in-the-inspector`, `fix/board-toolbar-and-root-route`) are merged history and can
be deleted.

Both task briefs in `docs/` are **complete, not pending** —
[TASK-board-hover-card.md](TASK-board-hover-card.md) (`aefc8ad`) and
[TASK-web-push.md](TASK-web-push.md) (`347eac0`). They are kept only for the traps they
record: the hover-card one documents how the Board's transformed world layer and pointer
hit-test break naive changes, which is still the best reference for anyone touching
`canvas.tsx`. **Do not pick either up as work.**

## Open items — only the owner can do these

1. **Prove web push actually works.** It is built and every piece is verified *except
   delivery*: 0 subscriptions exist, so the 14:00 UTC cron is a live no-op. Install Capsule
   to the home screen, grant permission from the control in the Ledger rail, then re-run the
   cron with the secret and see whether the phone buzzes. **Until that happens, treat push as
   unproven** — a green gate has certified a dead feature here twice.
2. **Choose a custom domain.** It unblocks three things at once: Clerk is still a
   `pk_test_…` development instance (~60s tokens, shared `accounts.dev`), the VAPID `subject`
   in `src/server/push.ts:57` is hardcoded to the Vercel URL, and install screenshots need a
   stable origin.
3. **Decide whether sign-up stays open.** Still public. `/api/extract` is rate-limited and
   idempotent so the exposure is bounded, but an allowlist would close it.
4. **Decide on `AGENTS.md` and `docs/design-directions/`** — both untracked. The latter is
   the imported Claude Design capture (`Capsule.dc.html` + its runtime) and is already
   excluded from eslint.
5. Real-device testing of the capture path. Nothing in warp, the detector, safe areas or the
   splash has ever met an actual photographed object on real hardware.

## Deliberate limitations — do not "fix" these

- **Derivatives are not alpha-masked.** The design system clips every cutout in CSS; baking
  the silhouette would duplicate it and make the stored image wrong the moment a cut style
  changes.
- **The hover card is desktop-only.** Phones get the tap-sheet instead; a drag-following card
  would sit under the thumb.
- **The phone lot sheet only opens for an explicitly chosen lot**, never the default
  selection — otherwise it covers the stream on every first visit.
- **`moveObjectAction` deliberately does not revalidate.** Drag persistence is optimistic;
  revalidating would fight the local override.
- **The Board's default positions are derived from `lotNo`, never list index.** Index-derived
  positions rearranged every unplaced object whenever anything was dragged.
- **Web Share Target is Android/ChromeOS only.** iOS has never supported it (WebKit 194593).
  The plan calls it high-leverage; on this app's actual platform it does nothing.
- **`/accession` is a server render**, so the offline shell only helps if the page was loaded
  once before. True offline capture is unbuilt, not broken.

## Backlog

Roughly in the order that unblocks the most:

1. **Install affordance UI** — small, and it is the thing standing between push and being
   provable.
2. **Custom domain** — retires three pieces of debt at once (see Open items #2).
3. **Verso flip animation** — the Cabinet's recto→verso 3D card flip, spec'd in the plan.
4. **Full axe / keyboard audit** — individual fixes landed during the 38-site audit; a
   systematic pass never ran.
5. **Share-view notifications** — the push follow-up; needs a view-counting hook that does
   not exist yet.
6. **True offline capture** — needs a static `/accession` shell fed from IndexedDB.
7. **MAP tab** — the plan's own "phase 10 at the earliest". MapLibre over Protomaps/CARTO,
   the only screen with an external dependency and a possible tile bill. Genuinely last.

## Working notes — the traps

**Nothing syncs the Vercel env vars any more.** The Neon Marketplace resource was deleted on
2026-08-01, and deleting it **did** strip all sixteen Postgres variables. Recovery is
`scripts/restore-vercel-env.sh`. Two things about that:

- Overwriting an integration's variable with `vercel env add --force` does **not** detach it.
  A marketplace store claims its variables *by name*, so the values change and the store keeps
  ownership. `configurationId: null` is not evidence of detachment.
- The restore script defaults to all three targets, but **reading only the first block of its
  output looks like success while a whole target is still empty**. That happened: production
  read 16/16 while development was 0/16. Always re-count all three afterward.

**A missing `DATABASE_URL` does not fail the build.** `src/server/db/index.ts` and `pool.ts`
construct their clients lazily, by design. `next build` succeeds with no database env at all —
the deploy goes green in ~45s, aliases itself, and *then* every authed page 500s. After any
env change, gate on `vercel env ls` and `/api/health`, never on the build.

**Deploy is manual** (`npx vercel --prod --yes`). A green `master` says nothing about
production, and env changes only take effect on a *new* deployment — Vercel snapshots env at
build time.

**The rollback is a file now.** `backups/capsule-prod-2026-08-01.dump` is the only copy of the
pre-migration archive; the old Neon project is gone. It was test-restored into a disposable
PostgreSQL 17.9 cluster and re-hashed byte-identical, so it is known-good, not hoped-good.
`backups/` and `*.dump` are gitignored — they were not before, which is how a dump nearly
landed in git.

**An active compute is not proof a database is in use.** An audit flagged a second Neon
project as live-and-unbacked purely from compute activity and size, and nearly turned a
correct cleanup into a scare. Check what a Vercel project's `DATABASE_URL` actually points at
before calling a database load-bearing.

**Verification reality.** Every authed surface is behind phone-only SMS sign-in, so an agent
cannot sign in. Coverage comes from three places: the six proof gates (below the DOM), a
pointer harness driving synthesized input at a handler, and `/design` — public, un-gated, and
the sanctioned place to make a new primitive visually verifiable. The gap that remains is
composed layout at desktop width, which needs the owner's eyes.

**Two habits this repo keeps re-learning.** A grep is not a fix — a status re-check twice
reported a defect gone on the strength of a string match and was wrong both times. And a
green gate has twice certified a dead feature, once when photo capture was entirely broken in
production and once when a sort control did not sort. Assert on what the page renders.
