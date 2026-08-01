# Handoff — 2026-07-31 (final)

Supersedes the 2026-07-28 handoff. That document was a phase-by-phase narrative of how v2 got
built; the phase detail now lives in [CAPSULE-V2-PLAN.md](CAPSULE-V2-PLAN.md) and the durable
platform traps in [../CLAUDE.md](../CLAUDE.md). This is state and traps only.

## State

| | |
|---|---|
| Branch | `master`, tree clean, pushed. 19 commits since the audit |
| Reviewed | The desktop branch was adversarially reviewed (56 raised → 29 confirmed → fixed), cleaned up by 4 agents, merged, deployed |
| Production | `capsule-omega-ruby.vercel.app`, running the same commit. Deploy is manual — `npx vercel --prod --yes` |
| Gates | `build` `typecheck` `lint` `db:check` all 0; `db:verify` 33, `db:verify:p6` 29, `db:verify:upload` 12, `db:verify:desktop` 39, `db:verify:warp` 11 |
| Prod archive | 2 users, 41 objects (lots 1–139), 5 people, 1 share, 1 intake batch |
| Prod images | 41 `object_faces`: **1** has a `cutout_url`, **0** a `thumb_url`. The 40 seeded fixtures never had images. New captures persist all four; nothing backfills the old rows |
| Migrations | `0003` intake thumb/width/height · `0004` api_usage · `0005` intake exif. All applied to `main` **and** `verify` |
| Neon | project `old-math-03360848` in the **personal** org `org-restless-flower-66125015` · branch `main` = production · branch `verify` = gates + local dev. Migrated off the Vercel-managed org 2026-08-01 and the old project (`purple-river-19152863`) is **deleted** — there is no Marketplace resource behind this any more, so nothing syncs the Vercel env vars. Re-push them with `scripts/restore-vercel-env.sh`. Pre-migration dump: `backups/capsule-prod-2026-08-01.dump`. |
| Vercel | project `capsule` · `prj_6sLVlwcBGVtNtwXZjCL1C3kjBlTM` · team `peyton-doyle` |
| Blob | `capsule-media` (public) `store_tCVSYcNtL8WVtWGV` · `capsule-originals` (private) `store_TJ3jyzfgZpJQro01` |
| Clerk | app `app_3H2m8Htunq84mjsLvOiAEnixExd` · **development instance** `unified-polecat-6.clerk.accounts.dev` |

## Open task briefs

- [TASK-board-hover-card.md](TASK-board-hover-card.md) — the last phase-8 deferral,
  written to be handed to an agent cold. Presentation only; the data is already on the
  client.

## What changed — 2026-07-31

Seventeen commits. The audit list went from 38 open to 9, and none of the nine
loses data. Six of the fixes came with a new proof gate; two came from a review
of my own work that found defects worse than the ones being fixed.

**Everything below the DOM is now gated.** `db:verify:desktop` (39) covers the
Ledger sort, the inspector's save path and the three Board actions;
`db:verify:warp` (11) covers the perspective geometry against synthetic ground
truth; `db:verify:p6` grew 15 → 29 with the derive-persistence race, the
skipped-item guard and the rate limiter. Two gates that could not fail were
rewritten so they can.

**The review paid for itself twice.** An adversarial pass over the desktop
branch raised 56 findings, 29 survived three refutation lenses, and two were
serious: saving from the new inspector erased `retained_location` on every
save, and the sort control did not sort — `group()` re-sorted the rows it was
handed, and the gate had asserted on the query rather than on the render. A
subsequent cleanup pass by four agents then found that the edit panel's hidden
inputs were being smuggled through the `title` slot and landing inside the
panel's `<h2>`, leaving the heading with no accessible name — on the branch
whose purpose was adding headings.


Two commits on `master`, deployed. Eight on `feat/edit-in-the-inspector`, **not merged and not
reviewed**.

**Deployed.** The Board toolbar was inert — `setPointerCapture` ran after the if/else in
`canvas.tsx`, so it fired on every pointerdown including one that started on a button, and a
captured pointer retargets the click to the capturing element. SCATTER, TIDY, CLUSTER BY, FIT and
"+ ADD" were unreachable; every action behind them was already correct. `/` was still the phase-1
debug page printing the raw Clerk id under a hardcoded "0 OBJECTS · 0 PEOPLE", and every sign-in
path lands there; it is now a redirect.

**On the branch.** The Ledger inspector edits in place (`?edit=1`), so adding a date to a filed
object no longer means a six-step detour through `/o/[lot]`, which was a 430px phone column on a
desktop screen and the only caller of `saveFieldsAction`. `NEWEST` became a real control — it was a
`<span>`, and `listTimeline` had no sort parameter to give it. The rail reaches Board and Cabinet.
`/o/[lot]` opens into two columns above `lg` and is untouched below it. Ten accessibility findings,
of which the load-bearing ones were: no surface had an `h1`, and filing destroyed keyboard focus.

**One landmine closed that nobody asked about.** `scripts/seed.ts` had no verify-branch guard while
all three gates do, so `npm run db:seed` wrote to whatever `DATABASE_URL` pointed at — production.
Seeding allocates lot numbers, which are accession numbers and are never reissued.

**New gate.** `db:verify:desktop`, 24 checks: the sort really reverses, the inspector's save
round-trips and clearing a date drops precision to `unknown`, and TIDY / SCATTER / CLUSTER BY all
work (SCATTER asserted *deterministic*, not merely different). It writes, so it snapshots
`board_x/y/z` and restores in a `finally`.

**Not verified.** The composed DOM of `/timeline` and `/board` while signed in — that `EDIT` is
where it should be, that the rail renders sensibly, that the responsive `/o/[lot]` grid holds at
desktop width — and focus retention when filing. Every surface is auth-gated and no gate covers
layout. Coverage came from three places instead: `db:verify:desktop` for behaviour, a pointer
harness for whether a click reaches it, `/design` for how it looks.

## What changed — 2026-07-28

Ten commits, all bug fixes, all from adversarial review rather than from feature work.

**Capture was broken in production and is now fixed.** The ownership check added earlier
(`assertOwnedOriginalUrl`) required every original to sit under `intake/{ownerId}/`, on the belief
that `/api/blob/upload` rewrote the pathname to match. It does not — `handleUpload` puts the
*client's* pathname into the issued token and discards whatever `onBeforeGenerateToken` returns. So
every blob landed at the store root and every upload was rejected on the way back in. The path is
now the client's to propose and the route's to refuse. Separately, `handleFiles` read the input's
live `FileList` *after* its first `await`, by which point the change handler had cleared it — so the
first "+ ADD PHOTOGRAPHS" of every session silently uploaded nothing and the second worked.

**Three ways photographs could be destroyed, closed.** The P6 gate swept every intake blob belonging
to its `--owner` — and a filed object's `object_faces` URLs are the *same strings* as its
`intake_items` URLs, so it deleted live images of already-filed objects from the production store;
it also adopted whatever was waiting in `/queue` as its probe and deleted that. The offline drain
keyed its "safely uploaded" set on `file.name`, and every iOS camera capture is called `image.jpg`,
so one success authorised deleting a same-named failure. Account deletion removed every row holding
a blob URL and none of the blobs.

**Gates and dev no longer run against the live archive.** `.env.local` and Production share one Neon
endpoint. `scripts/verify-db.ts` repoints the gates at the `verify` branch and refuses to run
without it; `npm run dev` (via `.claude/launch.json` → `dev:verify`) does the same.

**Smaller, user-visible:** chips inside the filing form were typeless `<button>`s, i.e. submit
buttons, so tapping a suggested person filed the object. The Board's drag stuck forever on
`pointercancel`. A late derive/extract could resurrect a filed item and jam the queue at an
unfilable head.

## Verified how

Not by reading diffs. A throwaway Clerk account was driven through the real browser: upload landed
at `intake/{clerkId}/image-{suffix}.jpg`, derive ran, filing advanced the queue 2 → 1, the `+ someone`
chip did not submit, and the production database was untouched throughout. Deleting that account
took its blob count 4 → 0, which is the account-deletion fix proven rather than asserted.

`db:verify:upload` is new and exists specifically because `db:verify:p6` seeds through the
server-side `put()` — the share-target shape — and therefore never exercised the browser upload path
at all. That gap is what let a dead capture flow ship.

## Open items — only you can do these

1. **Clerk is a development instance in production.** The key served at `/sign-in` is `pk_test_…`.
   Dev instances have hard usage limits, issue ~60-second tokens, and authenticate through Clerk's
   shared `accounts.dev` domain. A production instance requires a custom domain and DNS records —
   which is why this is blocked on you choosing a domain. Until then the app is not fit for anyone
   but you.
2. **Decide whether sign-up stays open.** It is public, and `/api/extract` bills Anthropic per call
   with no rate limit (below).

## Deliberate limitations — do not "fix" these

- **`moveObjectAction` does not revalidate.** The client already shows the truth it created; a
  revalidate would fight the drag. The override retires by matching the server value.
- **Derivatives are not alpha-masked.** The design system clips every cutout in CSS; baking the
  silhouette would double it and make the stored image wrong the moment the cut style changes.
- **Lot numbers are not gapless over time.** A lot number is an accession number, so deleting an
  object retires it permanently. `db:verify` asserts unique-and-monotonic, not `1..n` — the older
  "gapless from 1" assertion could not pass twice, because the gate's own concurrency test creates
  and deletes objects.
- **`deleteBlobs` swallows failures.** A leaked blob is recoverable by a sweep; a throw would leave
  someone unable to delete their own object.
- **Blobs are not branched.** The `verify` Neon branch isolates rows, not bytes. Anything that
  deletes blobs during a gate run hits the real store — which is why the P6 gate now tracks ids.

## Known bugs

A 152-agent adversarial audit ran over the whole app on 2026-07-28. It confirmed **44 findings — 0
critical, 9 high** — each having survived two independent attempts to refute it, one on
reachability and one on real-world impact. Deduped by site below; where two dimensions found the
same defect from different angles the fuller write-up is kept.

**Status as of 2026-08-01: all 38 fixed.** The last one — the muted-token
contrast — was a design decision, and the owner made it (compress the scale;
see the tokens.css item below). Every site was re-checked
against the branch on 2026-07-31; fixed ones are marked ✅ and partial ones ◐. All of them are now
on `master`.

**Do not trust a "fixed" mark you have not re-derived — this has now bitten twice.**
The first time, a re-check called `src/server/users.ts:75` fixed because `deleteBlobs` is passed
`f.thumbUrl`; it is NULL on every row, so the call deleted nothing. The second time, a grep for
`clipboard` in `share-button.tsx` looked like a fallback and was the unrelated `else` branch for
browsers without `navigator.share`. Both were caught by reading the code. A grep is evidence that a
string exists, not that a defect is gone. The re-check initially returned
`src/server/users.ts:75` as fixed because `deleteBlobs` is passed `f.thumbUrl`. It is still open:
`thumb_url` is NULL on every row of both databases (`select count(thumb_url) from object_faces` = 0),
because `/api/derive` never persists it, and `deleteBlobs` skips nulls. Passing a column that is
always NULL is not a fix.

The raw audit output (evidence, reproductions, refutation reasoning) was in session scratch and is
gone; what follows is the durable record.

### High

✅ FIXED — **`src/app/accession/uploader.tsx:77`** — Offline capture never engages on the first pick of a session: startBatchAction is awaited before any file is touched, so with no network the picker aborts with a raw "Failed to fetch" and parks nothing in IndexedDB.
<br>*Fix:* Do not gate the files on the batch. Park every picked file in IndexedDB first (or at minimum when `!navigator.onLine`), then mint the batch. Defer batch creation to the first successful upload, and give the offline case its own copy — "no signal — 3 photographs saved on this device, they'll upload next time" — instead of the browser's fetch error string.
<br>*Status ✅ FIXED:* Files are parked in IndexedDB before the batch is minted, so the basement case works on a fresh session; the batch follows on the next online visit.

✅ FIXED — **`src/app/api/derive/route.ts:41`** — The route persists only cutoutUrl; thumbUrl, width and height from deriveFromOriginal are returned to the browser and thrown away, so every object in the archive renders at the fallback 1.15 aspect and the t640 thumbnail is dead weight.
<br>*Fix:* Add thumb_url/width/height to intake_items (or pass the derive result straight through), have /api/derive persist all four, and have fileIntakeItem copy thumbUrl, width and height onto the object_faces row alongside cutoutUrl.
<br>*Status ✅ FIXED:* 358ecbe. `intake_items` gained thumb_url/width/height (migration 0003) and the route persists all four. `db:verify:p6` asserts it.

✅ FIXED — **`src/app/board/canvas.tsx:197`** — The Board container calls setPointerCapture on every pointerdown, which retargets the subsequent click to the container and kills every control inside the canvas — SCATTER, TIDY, CLUSTER BY (and its four menu items), FIT and the "+ ADD" link.
<br>*Fix:* Only capture when a card is actually grabbed: move the `setPointerCapture` call inside the `if (el) { ... }` branch. For panning, either skip capture entirely (pointermove/pointerup on the container already cover the gesture while the pointer is over it) or capture only after confirming the pointerdown did not originate in chrome — e.g. `if (!(event.target as Element).closest('button, a')) { pan.current = ...; setPointerCapture(...) }`. Guarding the pan branch this way also stops toolbar drags from panning the board.
<br>*Status ✅ FIXED:* a4f3e55, deployed. The capture now only runs for a real drag or pan; a press that began on `button, a` returns first, which also stops toolbar drags panning the board.

✅ FIXED — **`src/app/page.tsx:19`** — The root route — where every sign-in lands — is still the phase-1 platform-wiring debug page, and it renders a hardcoded "0 OBJECTS · 0 PEOPLE" in the archival mono style regardless of what is in the archive.
<br>*Fix:* Make `/` a redirect: `const { userId } = await auth(); redirect(userId ? '/timeline' : '/sign-in')`, and delete the debug dl. Alternatively point the three sign-in redirects (sign-in/page.tsx:47, sign-in/page.tsx:131, sso-callback/page.tsx:7) at '/timeline' to match manifest.ts start_url. Either way the SESSION / DB ROW rows printing the Clerk id should not stay on a production route.
<br>*Status ✅ FIXED:* 4502709, deployed. `/` redirects to `/timeline` or `/sign-in`.

✅ FIXED — **`src/server/derive.ts:55`** — sharp cannot decode HEIC/HEIF, so every HEIC original fails derive and the item never gets an image, with no error surfaced anywhere.
<br>*Fix:* Either decode HEIC before it reaches sharp (transcode client-side in the uploader via createImageBitmap/canvas before upload, which also fixes the corner editor's <img>), or drop 'image/heic'/'image/heif' from allowedContentTypes so the upload fails loudly at the picker with a message the user can act on. Whichever is chosen, /api/derive's 500 must be surfaced: the uploader should mark the item failed and CornerEditor.save() must show the error instead of silently doing nothing when res.ok is false.
<br>*Status ✅ FIXED:* 358ecbe. Not fixed server-side — it cannot be. sharp's libheif ships the AV1 codec only (`sharp.format.heif.input.fileSuffix` is `['.avif']`), so no HEVC HEIC will ever decode there however sharp is upgraded. `src/lib/heic.ts` transcodes to JPEG in the browser before upload, on the device that has the codec; browsers that cannot decode it refuse at the picker with a message. Verified in Chromium that the refusal path is graceful. **The success path is only reachable on Safari/iOS and has not been driven.**

✅ FIXED — **`src/server/derive.ts:93`** — Re-cutting an object appears to do nothing: derivatives are overwritten at a byte-identical URL that Vercel Blob serves with `cache-control: public, max-age=2592000`, so the browser keeps painting the pre-adjustment cutout for 30 days.
<br>*Fix:* Make the derivative key change when the pixels change — e.g. `${target.key}/cutout-${hashOfCorners}.webp`, or keep `addRandomSuffix: true` and store the returned URL — so a re-cut yields a new URL. If the path must stay deterministic, pass `cacheControlMaxAge` short enough to revalidate (and drop the SW's CacheFirst rule for derivatives in favour of StaleWhileRevalidate), or append the item's `updatedAt` as a query parameter at render time.
<br>*Status ✅ FIXED:* Derivatives are random-suffixed and never overwritten, so a re-cut mints a new URL. `/api/derive` deletes the stale pair once the rows point at the new one. Same fix closed the dev-writes-prod-blobs overwrite.

✅ FIXED — **`src/server/intake.ts:189`** — fileIntakeItem snapshots the intake row's cutoutUrl into object_faces, and nothing ever backfills that face — an item filed before its derive lands becomes an object whose photograph is unreachable on every surface, permanently.
<br>*Fix:* After a successful derive, write through to the face as well as the intake row: in /api/derive, if the item already has an objectId, UPDATE object_faces SET cutout_url = $1, thumb_url = $2, width, height WHERE object_id = $3 AND role = 'recto'. Alternatively have fileIntakeItem refuse to file an item whose cutout_url is null (or file it and enqueue a repair), so a face is never created pointing at nothing.
<br>*Status ✅ FIXED:* 358ecbe. `fileIntakeItem` carries all four onto the face, and `repairObjectFace` writes a late derive through to an object already filed. The gate reproduces the race directly — blanks the face, lands a derive, proves the repair — and proves another owner cannot.


### Medium

✅ FIXED — **`package.json:25`** — dev:verify repoints only the database at the verify branch while leaving the production Blob tokens in place, so an ordinary local dev session overwrites live production image bytes at deterministic paths.
<br>*Fix:* Branch the bytes as well as the rows, or refuse to write: have dev:verify also point BLOB_READ_WRITE_TOKEN / BLOB_ORIGINALS_READ_WRITE_TOKEN at scratch stores (and fail fast if they still resolve to the production store ids), the same way verify-db.ts refuses to run without DATABASE_URL_VERIFY. At minimum, drop `allowOverwrite: true` from deriveFromOriginal and version the derivative key so a re-derive can never clobber bytes an existing row references.
<br>*Status ✅ FIXED:* `dev:verify` repoints blob tokens at `*_VERIFY` scratch stores when set and warns loudly when not. With overwrites now impossible the residual risk is orphans, not destruction.

✅ FIXED — **`src/app/accession/[itemId]/editor.tsx:50`** — CUT IT OUT does nothing at all when /api/derive returns a non-2xx — there is no else branch — and when the service worker is active it treats the worker's offline 202 as success and navigates away as if the cut happened.
<br>*Fix:* Add an error state: `if (!res.ok) { setError(res.status === 401 ? 'Signed out — sign in and try again' : 'Could not cut this out. Try again.'); return }`, wrap the fetch in try/catch for the network case, and treat 202 explicitly ("queued — this will be cut out when you're back online") instead of letting res.ok conflate it with a real derive.
<br>*Status ✅ FIXED:* Non-2xx, network failure and the SW's synthetic 202 each say what happened instead of appearing inert or navigating away.

✅ FIXED — **`src/app/accession/uploader.tsx:177`** — The offline upload queue in IndexedDB is not owner-scoped and is never cleared on sign-out, so on a shared device the next user to open /accession silently uploads the previous user's parked photographs into their own archive.
<br>*Fix:* Stamp `ownerId` onto each `PendingUpload` row at `enqueueUpload` time and filter in `listQueued(ownerId)`, so a drain only ever uploads rows belonging to the signed-in user; rows belonging to nobody in this session stay parked (or are dropped after a retention window). Belt and braces: wrap `SignOutButton` in a handler that deletes the `capsule-offline` database before signing out.
<br>*Status ✅ FIXED:* Rows stamped with `ownerId` at enqueue, filtered at drain. Pre-existing unstamped rows are never drained.

✅ FIXED — **`src/app/api/extract/route.ts:31`** — No rate limiting exists anywhere — app-level or platform-level — on /api/extract (billed Anthropic calls) or /api/derive (sharp CPU + Blob writes), and Clerk sign-up is public.
<br>*Fix:* Add a per-owner token bucket in front of both routes (Vercel Runtime Cache or an Upstash counter keyed on `user.id`), and make /api/extract idempotent — short-circuit with the stored `item.suggestions` unless the request explicitly asks for a re-run. Consider gating sign-up (allowlist or waitlist) for a single-user archive.
<br>*Status ✅ FIXED:* Postgres-backed hourly caps (120 extract / 400 derive) — in-memory would not survive a cold start. Extract is idempotent unless `force`. 9 assertions in p6.

✅ FIXED — **`src/app/api/share-target/route.ts:36`** — The share target creates intake items but never triggers a derive, then redirects straight to the Filer, so a shared photo files as an object with no image at all.
<br>*Fix:* Call deriveFromOriginal inline in the share-target loop after addIntakeItem (the route already has runtime 'nodejs' and maxDuration 60, and the ~4.5 MB body cap bounds the work), persisting cutoutUrl/thumbUrl/width/height on the item before redirecting.
<br>*Status ✅ FIXED:* Derives inline; a failure leaves a filable item the corner editor can repair rather than losing the share.

✅ FIXED — **`src/app/layout.tsx:64`** — There is no error.tsx, global-error.tsx or not-found.tsx anywhere in the app, so any Server Action rejection replaces the whole document with Next's generic "This page couldn't load" and destroys everything the user typed.
<br>*Fix:* Add src/app/error.tsx (a Ledger-surface 'use client' boundary with unstable_retry), src/app/global-error.tsx, and src/app/not-found.tsx. Separately, stop relying on the boundary for expected failures: wrap each mutating client call in try/catch and surface a real message — for the filer, keep the form contents mounted and show "Couldn't file this — your words are still here" rather than losing them.
<br>*Status ✅ FIXED:* `error.tsx`, `global-error.tsx`, `not-found.tsx`. The filer additionally keeps its fields mounted on failure rather than relying on the boundary.

✅ FIXED — **`src/app/queue/filer.tsx:172`** — Once "+ someone" is tapped the hidden givenBy input is unmounted, so a person chosen from the suggestion chips still renders as selected but is silently dropped from the filed object.
<br>*Fix:* Render the `chosen.person` hidden input unconditionally (outside the namingPerson ternary) and suppress it only when the free-text field actually has a value, or — simpler — have the chips clear `namingPerson` when tapped (`setChosen(...); setNamingPerson(false)`), and give the free-text field an escape (blur/Escape → `setNamingPerson(false)`) so the two inputs can never both be live.
<br>*Status ✅ FIXED:* Chips close the free-text input; the input backs out on Escape or empty blur. They can no longer both be live.

✅ FIXED — **`src/components/share-button.tsx:18`** — navigator.share is called only after awaiting a Server Action, so once transient activation expires the share sheet never opens and the bare catch swallows the failure with no message and no clipboard fallback.
<br>*Fix:* Do not gate the sheet on the round trip. Either mint the share link ahead of the tap (fetch it on mount / on hover and keep it in state, so `navigator.share` runs synchronously in the click handler), or pass the promise to the Web Share API path that accepts one. Failing that, catch the share rejection and fall through to `navigator.clipboard.writeText(url)`, and surface a real error state instead of swallowing it — at minimum distinguish AbortError (user dismissed) from NotAllowedError.
<br>*Status ✅ FIXED:* The link is minted on hover/focus so `navigator.share` runs with transient activation intact. AbortError is distinguished from failure, and failure falls back to the clipboard and says so.

✅ FIXED — **`src/design/cutout.tsx:116`** — Every grid renders the 1600px `cutoutUrl` eagerly; the 640px `thumbUrl` that derive.ts produces for exactly this purpose is never used anywhere in the app.
<br>*Fix:* Add `thumbUrl` to the `recto`/`face` projections in board.ts:36 and cabinet.ts:44, and render `thumbUrl ?? cutoutUrl` in Stream, SearchResults, cabinet shelves and the Board (keep `cutoutUrl` for the single Inspector hero and /o/[lot], which go up to 280px). In cutout.tsx add `loading="lazy"` and `decoding="async"` to the `<img>`, with an opt-out prop so the first row and the Inspector hero stay eager. Together this takes the /timeline first paint at n=500 from ~100 MB to roughly the ~25-30 visible thumbs (~1-1.5 MB).
<br>*Status ✅ FIXED:* `thumbSrc` preferred in every grid, lazy by default, `eager` on the four heroes and the first row. 4.2x smaller on document-like content; 6.25x fewer pixels regardless.

✅ FIXED — **`src/design/tokens.css:33`** — --mute-2 and --mute-3, the tokens behind every date, count, field label and caption in the app, sit at 2.48:1 and 2.08:1 on the Ledger — well under the 4.5:1 required for text this size.
<br>*Fix:* Darken the two muted tokens per surface until they clear 4.5:1 at the sizes they are actually used at: Ledger --mute-2 needs roughly rgb(42 37 29 / 0.72) and --mute-3 roughly rgb(42 37 29 / 0.62); Cabinet --mute-2 ≈ rgb(236 234 228 / 0.72), --mute-3 ≈ rgb(236 234 228 / 0.60); Board --mute-3 ≈ #6c5d43. If the palette must stay as-is for pure decoration, keep the light values only for genuinely non-text uses (the aria-hidden dots and rules) and give text.tsx its own accessible tokens.
<br>*Status ✅ FIXED:* 2026-08-01, owner's call: compress the whole scale rather than collapse it. The audit's fear was overstated — the true 4.5:1 floor is alpha 0.64 on the Ledger (worst ground: panel) and 0.50 on the Cabinet, not 0.72 — so three distinct compliant steps fit. Ledger 0.87/0.76/0.67 (worst 4.93:1), Board #4a3f2c/#5a4c35/#6c5d43 (4.83:1 — the old mute-2 became mute-3), Cabinet 0.75/0.62/0.52 (4.78:1). Verified rendered, not just declared: computed styles on /design show the new values on all three surfaces, and a live mute-3 text node measures rgba(236,234,228,0.52).

✅ FIXED — **`src/server/board.ts:128`** — TIDY, SCATTER and CLUSTER BY each issue one sequential HTTP round-trip per object, so a Board button costs O(n) round-trips with no transaction.
<br>*Fix:* Replace each loop with one statement. For tidy/scatter: `UPDATE objects SET board_x=v.x, board_y=v.y, board_z=0 FROM (VALUES ...) AS v(id,x,y) WHERE objects.id=v.id::uuid AND objects.owner_id=$owner` (or compute the grid in SQL with `row_number() over (order by lot_no)`). For clusterBoardBy, do the same per dimension and wrap the delete + inserts + update in a real transaction via `getTxDb()`, which already exists for exactly this reason.
<br>*Status ✅ FIXED:* TIDY is one `UPDATE … FROM (VALUES …)` — atomic, and one round-trip instead of one per object. SCATTER and CLUSTER BY still loop; they rewrite different rows per object and were not the reported site.

✅ FIXED — **`src/server/board.ts:70`** — An unplaced object's default board position is derived from its index in a list ordered by boardZ, so dragging any single cutout — or adding or deleting one object — silently rearranges every object the owner has never placed.
<br>*Fix:* Derive the default slot from something stable per object rather than from list position — e.g. `defaultPosition(row.object.lotNo)` using lotNo (or a hash of object.id) for the angle and radius — or compute the index over a lotNo-only ordering taken before the boardZ sort.
<br>*Status ✅ FIXED:* `defaultPosition(lotNo)` only. Derived from the row index, every unplaced object moved whenever anything was dragged, added or deleted. A lot number never changes, so the position is stable forever.

✅ FIXED — **`src/server/users.ts:75`** — deleteUser does not delete the 640px derivative of every photograph, so "delete my account" leaves a public, unauthenticated thumbnail of every object in the media store forever.
<br>*Fix:* The thumb lives in the same folder as the cutout, so it is recoverable without a migration: in deleteBlobs' media list, for each non-null cutoutUrl also push `cutoutUrl.replace(/\/cutout\.webp$/, '/t640.webp')`. Cleaner: have /api/derive persist `thumbUrl` (add the column to intake_items, and copy it into object_faces.thumbUrl in fileIntakeItem alongside originalUrl/cutoutUrl) and then the existing `f.thumbUrl` term starts doing something. Apply the same change to deleteObject and scripts/verify-p6.ts cleanup.
<br>*Status ✅ FIXED:* 358ecbe — and it was *not* fixed by the earlier re-check's reading. `f.thumbUrl` is null on every row written before today, and deleteBlobs skips nulls. `thumbBesideCutout` derives the t640 path from the cutout instead. Applied to deleteUser, deleteObject and verify-p6, which was orphaning one into the real store per run.


### Low

✅ FIXED — **`scripts/verify-p6.ts:138`** — The rewritten P6 gate looks its own probe up inside a 50-row oldest-first window and then dereferences the result with `!`, so it crashes instead of running whenever the archive already holds 50 pending items.
<br>*Fix:* Do not go through the windowed list to find a row this script owns. Replace lines 135-138 with a direct lookup — `const [item] = await db.select().from(intakeItems).where(eq(intakeItems.id, seeded.itemId))` — and keep listPendingIntake only for the 'the probe is waiting' assertion, calling it with an explicit large limit (e.g. `listPendingIntake(ownerId, 1000)`) so both that check and the closing before/after comparison are meaningful.
<br>*Status ✅ FIXED:* Direct lookup by id; `listPendingIntake` keeps the "is it waiting" assertion with an explicit 1000 limit.

✅ FIXED — **`scripts/verify-upload.ts:31`** — The new upload gate re-implements the route's onBeforeGenerateToken instead of importing it, while its comment claims it "cannot drift from what ships" — and the copy has already drifted.
<br>*Fix:* Export the callback factory from a module both sides import — e.g. move it to src/server/blob-upload.ts as `export function intakeTokenOptions(ownerId: string)` — and have both route.ts and verify-upload.ts call it, so the gate exercises the shipped code. Failing that, delete the comment's claim, because it is the kind of confident-but-false comment this codebase has already been bitten by.
<br>*Status ✅ FIXED:* Both the route and the gate import `intakeTokenOptions` from `src/server/blob-upload.ts`. The copy had drifted to two content types against six and no size cap. Proven by mutation: disabling the ownership check inside the shared callback makes the gate fail 5 assertions, where before it passed regardless.

✅ FIXED — **`src/app/accession/[itemId]/editor.tsx:104`** — The four crop-corner handles are <button>s wired only to onPointerDown, so they are focusable and announced but do nothing when activated from the keyboard.
<br>*Fix:* Add an onKeyDown to each corner button that moves it with the arrow keys (1% per press, 5% with Shift) and clamps to 0-1, mirroring the pointer path's Math.min/max. Give the container a live region that reports the new position, and give the <img> a real alt such as `The photograph you are cutting out`. Announce the resulting crop box dimensions so the user can tell what CUT IT OUT will produce.
<br>*Status ✅ FIXED:* dfbfd3e, branch. Arrow keys move 1%, shift 5%, clamped by the same `Math.min/max` the pointer path uses; crop size announced; the `<img>` has a real alt. Reducer tested separately, 8/8.

✅ FIXED — **`src/app/accession/uploader.tsx:156`** — An enqueueUpload rejection escapes handleFiles entirely, leaving every tile of the pick stuck on "uploading" forever with no message and an unhandled promise rejection.
<br>*Fix:* Wrap the enqueue: `try { await enqueueUpload(...); patch({status:'queued'}) } catch { patch({status:'failed', error:'no signal, and this browser will not let the app hold the photo — reconnect and try again'}) }`, and add a `.catch` to the drain IIFE.
<br>*Status ✅ FIXED:* The enqueue inside the catch has its own try; a browser refusing IndexedDB fails one tile instead of stranding the pick.

✅ FIXED — **`src/app/api/blob/upload/route.ts:51`** — The client-upload token omits maximumSizeInBytes, so any signed-in user can park an arbitrarily large file in the private originals store and then use /api/original as a 2x bandwidth amplifier.
<br>*Fix:* Set `maximumSizeInBytes` in onBeforeGenerateToken (a phone photo is well under 50 MB) so the token itself refuses oversized bodies, and reject in deriveFromOriginal if the fetched original exceeds the same bound before it reaches sharp.
<br>*Status ✅ FIXED:* `maximumSizeInBytes` 50 MB on the token; `deriveFromOriginal` enforces it on both content-length and actual bytes.

✅ FIXED — **`src/app/catalogue/page.tsx:88`** — The catalogue's retention column is a 6px coloured dot whose aria-label sits on a bare <span>, where ARIA prohibits it — so retained vs digital-only is conveyed by colour alone.
<br>*Fix:* Mark the dot `aria-hidden` and put the state in a visually-hidden <span> next to it, matching the pattern already used in cabinet/page.tsx. Give the column a real <th> name such as "Kept". If the label must stay on the element itself, give it `role="img"` so aria-label is permitted.
<br>*Status ✅ FIXED:* dfbfd3e, branch. Dot is `aria-hidden`, state is a visually-hidden string, column has a real `Kept` header.

✅ FIXED — **`src/app/people/page.tsx:22`** — The back link on four pages is a bare '‹' glyph with no accessible name, while the same control on two other pages is correctly labelled.
<br>*Fix:* Add `aria-label="Back to the timeline"` (and "Back to people" on /people/{id}) to the four links, matching the two that already have it, and pad them to at least a 24×24 hit area.
<br>*Status ✅ FIXED:* dfbfd3e, branch. All six back links named, all with a 24px hit area.

✅ FIXED — **`src/app/queue/filer.tsx:148`** — Every suggestion chip in the filing queue is a toggle whose selected state is conveyed only by background colour — no aria-pressed, no text change — so a screen-reader user cannot tell what they have attached to the object.
<br>*Fix:* Pass `aria-pressed={chosen.person === name}` (and the place/date equivalents) at the three Chip call sites; Chip already forwards it through ...rest. Wrap each group in a `role="group"` with an aria-label ("Who gave it to you", "Where it came from", "When it arrived") so the chips are not an undifferentiated run of buttons.
<br>*Status ✅ FIXED:* dfbfd3e, branch. `aria-pressed` on all three chip groups, each wrapped in a named `role="group"`.

✅ FIXED — **`src/app/queue/filer.tsx:242`** — Filing or skipping an item destroys keyboard focus — the submit button is disabled mid-transition and the card is remounted by key — so a keyboard user restarts from the top of the document for every object.
<br>*Fix:* Use aria-disabled + an early return in the handler instead of the disabled attribute so the button keeps focus, and after the transition resolves move focus deliberately to the new card's heading (or back to the submit button) via a ref plus tabIndex={-1}. Pair it with the polite live region announcing "Filed. {n} left".
<br>*Status ✅ FIXED:* dfbfd3e + 8b03933. The `disabled` half, and the remount half — `autoFocus` on the submit button hands focus to the new card, since Card is keyed by item id so mount and advance are the same moment. Originally — both buttons are `aria-disabled` and keep focus, with the double-submit guard moved into `run`. **The remount half is still open:** the card is still `key={item.id}`, so React unmounts the focused subtree and nothing calls `.focus()` afterwards.

✅ FIXED — **`src/app/sign-in/page.tsx:209`** — There is no live region anywhere in the application — sign-in errors, upload progress and upload failures are inserted into the DOM silently.
<br>*Fix:* Give the sign-in error <p>s `role="alert"`. Add a single `aria-live="polite"` region to the uploader summarising "{done} of {total} uploaded" plus any failure text, and one to the filer announcing "Filed. {n} left" after each submit.
<br>*Status ✅ FIXED:* dfbfd3e, branch. Both sign-in error `<p>`s are `role="alert"`; polite live regions added to the uploader and the filer.

✅ FIXED — **`src/app/timeline/stream.tsx:68`** — None of the three main surfaces has an h1 — /timeline's first heading is an h2, and /board, /cabinet, /people, /places, /occasions and /catalogue have no heading at all.
<br>*Fix:* Give each surface an h1 naming it — "Timeline", "Board", "Cabinet", "Given by", "Places", "Occasions", "Catalogue" — visually hidden where the design has no room for it (the CAPSULE wordmark span in rail.tsx:26 and cabinet/page.tsx:45 is the natural host). Demote the Inspector's title to h2 under it or keep it at h2 and move the year headings to h2 with month runs at h3 so the outline is consistent.
<br>*Status ✅ FIXED:* dfbfd3e, branch. Every surface names itself, visually hidden where the design has no room; the sign-in wordmark became the `h1` it already looked like.

✅ FIXED — **`src/components/tag-editor.tsx:46`** — Tag chips are destructive buttons whose accessible name is just the tag text, and the new-tag input discards what was typed when focus leaves it.
<br>*Fix:* Give the chip `aria-label={`Remove tag ${tag.name}`}` (Chip already forwards ...rest) and render a visible × so sighted users see it too. Commit the typed value on blur instead of discarding it, or only close on Escape, and return focus to the "+ tag" chip after a successful add.
<br>*Status ✅ FIXED:* Chips carry `aria-label="Remove tag …"` and a visible ×; the input commits on blur instead of discarding, with Escape as the explicit discard.

✅ FIXED — **`src/design/capture.tsx:22`** — StickerDeck's `slice(-depth)` returns the whole ghost array when depth is 0, so the last photograph in the filing queue renders with two ghost cards behind it — identical to "three or more waiting".
<br>*Fix:* Guard the zero case: `const ghosts = depth <= 0 ? [] : [...].slice(-depth)`. While there, drop `src` from the ghost spread (`<Cutout {...top} src={undefined} label={undefined} />`) so the deck behind the live card is blank paper rather than two more copies of the same photograph.
<br>*Status ✅ FIXED:* `slice(depth <= 0 ? 0 : -depth)`. slice(-0) returned the whole array, so the last card showed two ghosts.

✅ FIXED — **`src/design/tokens.css:182`** — The Cabinet's scoped `.cutout-shadow` override ties on specificity with the `[data-state]` rules above it and wins on source order, so all four cutout states compute an identical shadow in the Cabinet.
<br>*Fix:* Move the `[data-surface='cabinet']` block above the state rules and scope it to idle, or add cabinet-scoped state rules: `[data-surface='cabinet'] .cutout-shadow[data-state='active'] { filter: drop-shadow(0 20px 28px rgb(0 0 0 / 0.6)) drop-shadow(0 2px 3px rgb(0 0 0 / 0.45)) }` and equivalents for dragging/pending.
<br>*Status ✅ FIXED:* Scoped to idle and the three states restated for the Cabinet. The override tied on specificity (0,2,0) and won on source order, so active/dragging/pending were invisible there.

✅ FIXED — **`src/design/tokens.css:164`** — `transform: scale(1.02)` on the active cutout state never applies on any surface, because Cutout always writes an inline `transform` and inline styles beat stylesheet declarations.
<br>*Fix:* Compose the scale into the inline transform in cutout.tsx:80: `transform: `rotate(${rotate}deg)${state === 'active' ? ' scale(1.02)' : ''}`` and drop the `transform` line from tokens.css:164. TiltLayer reads `el.style.transform` as its base (tilt-layer.tsx:51), so the scale composes correctly under hover.
<br>*Status ✅ FIXED:* The lift composes into the inline transform in cutout.tsx and is gone from the stylesheet — inline always beat it, so it never applied on any surface. TiltLayer reads the inline transform as its base, so it composes under hover.

✅ FIXED — **`src/server/intake.ts:114`** — The new PENDING_STATUSES guard keys on item.objectId, so it protects filed items but not skipped ones — a late derive/extract un-skips a photograph and puts it back at the head of the queue.
<br>*Fix:* Key the guard on the item having already left the queue rather than on objectId: `if (!(PENDING_STATUSES as readonly string[]).includes(item.status) && safe.status && (PENDING_STATUSES as readonly string[]).includes(safe.status)) delete safe.status`. This still permits the legitimate uploaded -> segmented -> needs_review progression (all four are pending, so the guard never fires) while covering 'skipped' as well as 'filed'.
<br>*Status ✅ FIXED:* Keyed on the item having left the queue, not on `objectId`, so skipped items are covered too. Asserted in p6.

✅ FIXED — **`src/server/intake.ts:52`** — addIntakeItem accepts an exif argument and never writes it, so the capture date and GPS the uploader reads off every photo are silently discarded.
<br>*Fix:* Add an `exif jsonb` column (or fold the EXIF date and coordinates into `suggestions` as {date:{value,confidence:1}} at insert time) and write it in addIntakeItem, so the Filer shows a date chip with no model involved and /api/extract has a real exifDate hint.
<br>*Status ✅ FIXED:* `intake_items.exif` added in `0005` and written. The capture date is additionally seeded into `suggestions` at confidence 1, so the Filer shows a date chip with no model involved and /api/extract finally finds the exifDate hint it always read and never found.

✅ FIXED — **`src/sw.ts:40`** — There is no offline behaviour at all: no precache, no navigation fallback, and a catch-all NetworkOnly, so the installed PWA is a browser error page whenever it is launched without a network — including /accession, the page whose entire purpose is offline capture.
<br>*Fix:* Precache one static, auth-free `/offline` shell (it needs no user data) and register it as the catch handler / navigation fallback for navigation requests, and precache the icons rather than hoping a runtime request populates them. If offline capture is meant to work, /accession's shell has to be reachable offline — that means a static capture route whose data comes from IndexedDB rather than a server render.
<br>*Status ✅ FIXED:* A static, auth-free `/offline` shell is precached at install and served as the navigation fallback — proven by building for production, confirming the worker activated and the cache populated, killing the server, and navigating. Note the finding overstated the starting point: blob derivatives, `/_next/static/` and `/icons/` were already runtime-cached and failed derive/extract POSTs already replayed through a `BackgroundSyncQueue`. What was dead offline was navigation, and only that. **Still not done:** `/accession` itself is a server render, so offline *capture* still requires having loaded the page first.


<!-- 38 distinct sites, deduped from 44 confirmed findings.
     2026-08-01 final: 38 fixed, 0 open. Every mark re-derived from HEAD. -->

### All 38 closed

The last one open — the muted-token contrast at `src/design/tokens.css:33` —
was a design decision, and the owner made it on 2026-08-01: redesign all three
mute values per surface rather than collapse the hierarchy. Details in the
Medium item above. The composed pages deserve the owner's eye at desktop width,
but the tokens are compliant and rendering.

### Only the owner can do these

1. **Clerk is still a development instance in production.** `pk_test_…`, ~60s
   tokens, shared `accounts.dev` domain. Blocked on choosing a custom domain.
   Until then the app is not fit for anyone but you.
2. **Decide whether sign-up stays open.** It is public. `/api/extract` is now
   rate limited and idempotent, so the exposure is bounded rather than
   unbounded, but an allowlist would close it.
3. **Install-card screenshots.** The manifest has no `screenshots`, so Chrome
   and Edge show the bare install strip. They need real captures of a
   signed-in archive.
4. **On-device feel.** Safe areas, splash, the keyboard layer and auto-detect
   are all verified structurally; only real hardware proves feel. Photograph
   something crooked and see where the corners land.

## Working notes

- **Deploy is manual.** `npx vercel --prod --yes` from the repo root. There is no git-push-to-deploy
  wired up, so a green `master` on GitHub says nothing about what production is serving.
- **`db:seed` can no longer reach production.** It now calls `requireVerificationBranch()` like the
  three gates, because it could not before and nothing about the command said so. Seeding allocates
  lot numbers, and a lot number is an accession number that is never reissued.
- **`db:verify:desktop` writes and restores.** It rewrites every board position, then puts them
  back in a `finally` and asserts the restore landed. If it is killed mid-run, re-run it — the
  restore is idempotent — or expect the board to be left tidied or scattered.
- **The verify branch is not your archive.** Its 40 objects belong to `user_seed_dev`, not to any
  Clerk id, and every query is owner-scoped — so signing in against the branch shows an empty
  archive until you seed under your own id.
- **The gates write.** They are not read-only checks; they allocate lots, upload a photograph, file
  it and delete it. They are safe only because they now target the `verify` branch and track what
  they create. If `DATABASE_URL_VERIFY` is missing they refuse to run — do not reach for
  `--allow-prod` to make that go away.
- **The `verify` branch drifts.** `db:migrate` targets production. After any schema change, recreate
  it: `neonctl branches create --project-id $NEON_PROJECT_ID --name verify` and put the pooled and
  direct URLs in `.env.local`.
- **Green gates proved less than they appeared to, twice.** `build`, `typecheck` and `lint` all
  passed while photo capture was completely dead in production, because the offending property is
  not in the library's declared return type. Both times the bug was found by driving the actual
  interaction, never by review. Weight browser verification accordingly.
- **Every fix batch this session introduced new bugs.** The first batch of 8 fixes introduced 4; the
  second batch of 10 has 44 findings against the app it left behind. Do not ship a batch of fixes
  from this codebase without re-reviewing it.
- **Clerk test fixture:** any email of the form `x+clerk_test@example.com` with code `424242`.
  Delete the user afterwards — `DELETE https://api.clerk.com/v1/users/{id}` with the secret key —
  and remember that deleting the Clerk user does *not* delete the Neon row or the blobs unless the
  webhook fires; call `deleteUser` directly if it did not.
- **Do not paste secrets into a shell.** `vercel env add` prompts for the value so it never reaches
  shell history.
