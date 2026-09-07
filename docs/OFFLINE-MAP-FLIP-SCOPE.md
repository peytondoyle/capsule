# Offline, Map, and Cabinet Flip Scope

This release makes Capsule useful without a connection across capture, filing, editing,
and browsing, then adds the Map surface and the Cabinet face-turn interaction. The
existing design authority remains [`CLAUDE.md`](../CLAUDE.md) and
[`CAPSULE-V2-PLAN.md`](CAPSULE-V2-PLAN.md). This document defines the behavior and
release boundary. Feature inclusion is confirmed; the interaction and implementation
decisions below are proposed. No map provider, tile license, or budget is selected.

## Product contract

After login and completed offline preparation, a user can kill and reopen the installed app in
airplane mode. Capture opens, photos and crops can be saved locally, and the local
archive can be filed, edited, searched, and browsed on Ledger, Board, Cabinet, Catalogue,
People, Places, Occasions, the filing queue, and object detail. Local save is a completed
action in its own right. Cloud sync is a
separate status that can be pending, syncing, failed, or complete. The UI must never
claim that a cloud write completed when it only reached local storage.

First login, AI extraction, and publishing a new public share require a connection.
They must explain that requirement and expose honest pending or blocked status where a
local record depends on them. Existing records and all user-entered edits remain
usable offline. Photos, crops, and recto/verso captures are first-class offline data.

## Data and sync foundations

IndexedDB becomes an owner-partitioned local archive, not only an upload waiting room.
It stores records, per-record drafts, face media and crop metadata, a durable outbox,
operation IDs, revisions, sync state, and delete tombstones. Record changes and their
outbox entries commit in one transaction. Every local write awaits the IndexedDB
transaction's commit before the UI reports success. Capsule never evicts unsynced media
to make room; the app must surface pressure and give the
user a way to prepare or remove already-synced media instead.
Browser-managed storage can still be cleared or evicted, so request persistent storage,
report whether it was granted, and offer export/recovery for pending captures. Local
save must not imply a cloud backup. See [WebKit's storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

Each cloud operation has a stable ID and is safe to retry. Upload, record creation,
filing, and edits are idempotent server operations. New local records use provisional
lot IDs until the server assigns their real lot; references and navigation must survive
that replacement. Sync retries on a real network failure when the app returns to the
foreground and on an `online` event. Two tabs coordinate draining so one operation is
not applied twice. Server sync revalidates the authenticated owner, rejects a row
stamped for another account, and leaves that row available for diagnosis rather than
silently moving it.
The remembered local owner enables offline use; it is never accepted as authentication
by the server. Explicit sign-out locks that owner's local views. Expired online sessions
pause sync until sign-in, while local work remains intact. Revocation learned on
reconnection must not be bypassed by a queued operation.

Records carry revisions. Non-overlapping field edits can merge; competing edits to the
same field, or edit-versus-delete, show the competing values and require resolution. A newer
write must not silently erase an unsynced local edit. Deletes are tombstones that sync
across devices and are retained long enough to prevent a stale device from resurrecting
the record.

The local bootstrap is a metadata snapshot plus a sync cursor, followed by deltas from
that cursor; applying either part must be resumable and revision-consistent. Prepared
downloads announce “ready” only after metadata and every selected asset have completed
and been verified. Because IndexedDB and service-worker caches are origin-scoped, the
custom domain and production auth setup must settle before users prepare archives. A
hostname migration needs an explicit drain/export path for old-origin drafts and
outbox work.

The service worker must support safe upgrades: old clients finish or recover outbox
work, cache names are versioned, and an update cannot serve one account's archive to
another. Media caching is explicit. The user can prepare the full library with a
visible download/progress state; originals needed for recropping are included in that
choice. A missing map region or uncached media has a clear offline state.

## Offline surfaces

The capture shell must cold-launch after initial setup without requiring a server
render. It accepts twenty photos with identical names, including recto and verso
captures, reads available metadata, saves each durable draft, and shows pending local
objects with the existing visual language. Crop and corner editing work offline.

Current perspective correction and derivative generation use server-side `sharp`/warp.
Offline editing therefore needs a browser worker preview/crop path that preserves the
original locally, then submits the authoritative crop/warp during sync. This is a
browser/PWA implementation slice and does not imply a native app rewrite.

Ledger, Board, Cabinet, Catalogue, People, Places, Occasions, the queue, and `/o/[lot]`
render from the local archive while offline.
Search works over locally available fields. Board movement and grouping edits save
locally and enter the outbox. Cabinet shelf placement, object detail fields, tags,
retention, and face selection follow the same local-write contract. Existing online
server paths remain the sync target rather than a second local behavior with different
semantics.

The offline queue should expose per-operation progress and retry actions, including
whether a record is waiting for authentication, media upload, server assignment, or a
conflict. A crash at every boundary (during local record/outbox commit, during media
upload, after server acknowledgement, and before local acknowledgement) must recover
without duplicate records or lost photos.

## Map

Add a MAP tab and a map surface for the places associated with objects. “Origin” means
where the object was received, as defined by the archive model. Camera EXIF coordinates
must not become provenance automatically; a user explicitly confirms or places the
origin pin. Place names and confirmed coordinates are searchable offline when cached.

The offline map package includes a coarse world basemap and user-selected detailed
regions. The UI distinguishes an uncached region, a cached region with no matching
place, and a place whose record has no confirmed coordinates. Map pins open the local
object/place view and remain usable offline. Manual pin placement and place search
write through the same local revision/outbox system.

MapLibre GL is the renderer suggested by the existing plan. Local PMTiles is a candidate
for packaged/offline regions. Provider, source, license, attribution, tile hosting,
download size, and budget are open decisions and must be resolved before implementation
locks the package format or network endpoints.

## Cabinet face turn

Cabinet’s hero supports one, two, or three faces (`recto`, `verso`, `detail`). With two
faces, the user can turn the card through a CSS 3D `rotateY(180deg)` interaction using
`backface-visibility: hidden`; the back must not be mirrored. One-face records retain a
stable hero with no fake verso. Three-face records expose accessible face controls and
the detail face. The interaction is available in the shared desktop inspector and the
phone lot view, with reduced-motion behavior that swaps faces without animation.

The release must verify the real back-photo attach/edit path, since the schema already
has face roles but the current UI only displays recto in Cabinet and uses simple dots on
object detail. Attaching, replacing, cropping, and deleting a verso while offline must
create durable local media and sync safely. The hero, labels, dots, keyboard controls,
focus state, and pending media state remain accessible.

## Delivery phases

1. **Foundations:** local schema, owner partitioning, durable transactions, operation
   IDs, revisions/tombstones, media storage, cache/version policy, conflict model, and
   the snapshot-plus-cursor bootstrap. Proposed decision: settle the custom domain and
   production auth origin before archive preparation is enabled.
2. **Capture and write sync:** cold-launch shell, local capture/crop/face writes,
   idempotent server sync, provisional lots, retry and two-tab coordination.
3. **Offline archive:** local rendering/search/edit behavior for every archive surface
   and index; prepared-library downloads and storage-pressure UX.
4. **Map:** provider/license decision, coarse world package, detailed region preparation,
   confirmed origin pins, cached search, and missing-region states.
5. **Cabinet flip:** shared accessible hero, real verso attach/edit flow, 1/2/detail
   behavior, reduced motion, and offline media sync.
6. **Device acceptance:** real iPhone/PWA airplane-mode testing, quota and upgrade
   testing, then the normal repository verification and release review.

Offline foundations are the large effort. Map is medium and depends on the unresolved
provider/package decision. Cabinet flip is small if verso attach/edit already exists;
the missing real back-photo flow expands it into a larger slice.

## Acceptance gates

- After preparation, airplane-mode kill/reopen can capture, crop, file/edit, search, and
  browse every archive surface and index; offline Map and face turn work for prepared data.
- Twenty same-named photos, recto/verso media, quota pressure, foreground/online retry,
  and crashes at each write/sync boundary preserve every photo exactly once.
- Account switch, two tabs, and two devices prove owner isolation, idempotency,
  revision conflicts, and delete tombstones without silent loss or resurrection.
- Service-worker update preserves pending work and never crosses account caches.
- Prepared-library progress, originals-for-recrop, uncached map regions, blocked AI/login/
  share actions, and all sync states render honestly.
- Normal repository verification passes: `npm run build && npm run typecheck && npm run lint`.

References: [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/),
[MDN Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API),
[PMTiles](https://docs.protomaps.com/pmtiles/).

## Implementation checkpoint — September 6, 2026

The first implementation slice adds owner-partitioned IndexedDB media/outbox storage,
transaction-completion guarantees (including the existing capture queue), a foreground
sync runner with cross-tab locks, and an authenticated object create/patch/delete sync
endpoint. The server uses stable operation/client IDs, full consistent snapshots,
field comparisons against legacy online edits, and delete tombstones. Other mutation
families explicitly reject requests until their implementations land.

The shared face viewer is connected to Cabinet's desktop inspector and object detail.
It turns actual front/back photographs, displays multiple details separately, and uses
44px keyboard-operable controls. Back-photo attachment and the phone sheet thumbnail
integration remain separate work.

These modules do not yet make the app fully offline. Remaining work includes the cold
start shell, authenticated local-session locking, capture/crop/upload integration,
provisional-ID reconciliation, conflict-resolution UI, full media preparation/recovery,
local views for every archive screen, taxonomy/face/collection mutations, Map data and
UI, and real-device acceptance. The new migration has only been exercised against a
disposable local database; it has not been applied to a hosted database. Nothing has
been pushed or deployed.

Local regression scripts: `verify-offline-store.mjs`, `verify-offline-sync.mjs`, and
`verify-sync.mjs`. The first two use an isolated `fake-indexeddb` test installation;
the third uses a disposable local PostgreSQL database and the real server functions.

### Capture checkpoint

Capture now writes raw photographs to the owner-scoped local queue before EXIF parsing,
HEIC conversion, or network requests. The uploader restores pending captures on mount,
retries on connection/focus return, and exposes manual retry and original download.
Immutable UUID upload paths plus idempotent intake registration recover lost upload and
registration responses without creating duplicate intake rows. Existing queue rows remain
readable; prepared capture IDs are persisted before the first upload attempt.

Ordinary photo bytes leave the local queue only after acknowledgement for that exact
capture. For HEIC, the existing image pipeline still uploads a converted JPEG: untouched
camera bytes remain locally downloadable after acknowledgement, with an explicit label.
Backing up those untouched HEIC originals to the cloud remains required for release.

The browser fixture verified a saved photo across reload with the server unavailable,
then a successful retry. Local tests cover twenty same-name photographs, storage aborts,
account changes, immutable upload token policies, lost acknowledgements, and concurrent
intake registration. The fixture uses simulated network services; live service and real
installed-iPhone testing remain outstanding. Cold-launch offline capture, offline cropping
and filing, and the full offline archive are the next slice.

### Offline launch checkpoint

A standalone `/offline.html` capture screen now opens without Next.js or Clerk assets.
Its complete HTML, JavaScript, and CSS bundle is hashed and verified before service-worker
installation succeeds. Network-failed navigations use that shell; current and previous
hashed shell assets remain available from their dedicated caches. Readiness checks inspect
actual cached contents, and preparation can repair missing assets while online.

An online, server-verified account enables local capture on the device. This remembered
account only selects local data; uploading still reauthenticates with the server. Account
changes or the offline screen's lock action hide local photographs across tabs while
preserving their bytes. Accession now reports when offline capture is prepared.

The browser fixture prepared the real generated worker and shell, disconnected all app
network responses, opened a fresh tab, captured a photograph, reloaded it successfully,
and verified locking across two tabs. This is desktop-browser proof; installed iPhone
and real airplane-mode acceptance remain outstanding. Offline cropping/filing, full
archive preparation and views, Map, and cloud backup of untouched HEIC originals remain.

### Offline crop and filing checkpoint

The standalone shell now keeps capture drafts with their crop, corrected preview, title,
kind, received date, place, occasion, giver, tags, and story in one local transaction.
Manual four-corner correction works without a connection, shares the server's perspective
geometry, and bounds canvas memory for large camera originals. Drafts can be saved and
reopened or marked ready to file. Source photographs and draft JSON remain downloadable.

Sync atomically freezes a ready draft before uploading; another tab cannot silently
replace the submitted details. Unfinished drafts are skipped. Filing reauthenticates the
owner, validates the crop and metadata, and commits the object, face, taxonomy links,
intake status, and stable filing receipt together. Duplicate and lost-response retries
return the same lot without reapplying details over later edits. Concurrent online edits
produce a conflict and retain the local draft. Filed captures retain their local original,
preview, metadata, and lot reference. Editing a submitted or filed local copy and resolving
conflicts in-app remain later work; saved details can currently be exported for recovery.

Delayed ordinary derive requests now compare their source crop and image version while
holding the intake lock, so an older request cannot replace a newer crop. Processing that
only overlaps ordinary filing still repairs the new face as before.

Local proof scripts cover transaction rollback, duplicate filing, later online edits,
malformed requests, owner isolation, storage-abort rollback, lost filing acknowledgments,
and corrected preview pixels from a synthetic 48MP source. The disconnected desktop browser
fixture also preserved crop/title/story across reload. This slice does not establish
installed-iPhone acceptance or live service behavior.

Remaining release work: full archive/media preparation and offline views, offline editing
of existing objects and taxonomy/collections/faces, conflict resolution, back-photo capture,
phone Cabinet integration, Map, untouched HEIC cloud backup, storage recovery, and real-device
acceptance. The sync migration is still local-only. Nothing has been pushed or deployed.

### Offline archive preparation and browsing checkpoint

The standalone shell now has an archive library with local search, date/lot ordering,
people/place/occasion/tag/collection filters, object details, front/back/detail photographs,
and downloadable originals. Search covers the complete snapshot; the grid shows 50 at a
time with an explicit Show More control. Archive-route navigation failures open this local
library, and Accession links to full archive preparation.

Preparation downloads all snapshot face and pending-intake media, including originals and
available derivatives. Each download is owner-checked and must match the exact URL version
in the snapshot. Public media URLs are also checked against the configured store and owner
path. Private tokens stay server-side; redirects are refused. Local media is partitioned
by account and keyed by immutable source URL, so retries reuse confirmed files.

IndexedDB v2 adds staged preparation records while preserving v1 archives, media, and
pending operations. The previous complete archive remains available during a refresh.
Only one transaction verifying every expected media entry can replace it and mark it
prepared. Progress is durable, preparation can be paused/resumed, and availability is
rechecked from stored bytes when the library opens. Missing files never produce a ready
claim. Older unreferenced media remains retained; storage reclamation is separate work.

Proof: build/typecheck/lint pass; `verify-archive-preparation.mjs` covers v1 upgrade,
interrupted refresh, reuse on resume, abort rollback, ownership/account changes, wrong
media-version acknowledgments, and search beyond 5,000 objects. `verify-offline-media.mjs`
uses a disposable local PostgreSQL database to verify the actual media route and ownership
queries with simulated upstream media. The desktop browser fixture downloaded 51 objects
and 104 media files, reloaded with all app network responses disconnected, searched beyond
the first page, and rendered front/back photographs and original-download links locally.

This is prepared-library browsing, not the complete offline release: existing-object edits,
full Ledger/Board/Cabinet/Map layouts, taxonomy/collection/face changes, conflict resolution,
back-photo capture, cloud backup of untouched HEIC originals, storage recovery/reclamation,
and installed-device acceptance remain. No hosted migration, push, or deployment occurred.

### Offline existing-object edits and review checkpoint

Prepared objects can now be edited locally: title, kind, story, received date, saved place
and occasion, retention, kept-at location, and material. Each save appends an immutable
operation with its own ID and field baseline; subsequent edits project immediately into
search and detail views. A stale tab cannot replace a field changed since its editor opened.
Unsaved editors survive background archive refreshes and require save/cancel before changing
local views. Pending edits sync explicitly or when the app returns to the foreground online.

A conflict preserves the final local values and shows per-field local/archive choices.
Resolution atomically replaces that object's halted operations with a new operation based
on the reviewed archive values. Missing choices, stale reviews, and interrupted writes do
not remove pending edits. Objects deleted elsewhere retain their local details for JSON
recovery until explicit discard; resolution does not silently recreate them. Metadata-only
sync preserves offline readiness when all required media remains stored. Incomplete sync
snapshots and malformed conflict responses cannot clear saved operations.

Proof: `verify-offline-edits.mjs` passes durable successive saves, independent/stale-tab
edits, validation and owner isolation, lost POST acknowledgments, incomplete GET recovery,
mixed conflict choices, storage-abort rollback, stale-review rejection, remote deletion,
and readiness preservation. Existing store/sync/preparation checks pass. `verify-sync.mjs`
passes against disposable local PostgreSQL, including successive patches and a new operation
based on reviewed server values. The desktop browser fixture saved edits disconnected,
reloaded and searched the new title, synced an archive-title/local-story resolution, and
retained the recovery JSON after remote deletion. Build, typecheck, and lint pass.

This completes only basic existing-object detail editing and its conflict review. People/tag
links, new taxonomy and collection edits, face/crop/back-photo changes, submitted-capture
review, full offline layouts, Map, untouched HEIC cloud backup, storage reclamation/recovery,
and installed-iPhone acceptance remain before the full offline release. No hosted migration,
push, or deployment occurred.

### Offline names and organization checkpoint

Existing-object editing now supports adding/removing people in each role, tags, and manual
collection memberships, plus creating named people, tags, places, occasions, and Cabinet
shelves. Place/occasion selection can be replaced or cleared. These values are saved in the
same immutable object patch and local transaction as the other details. Search, filters,
and detail views immediately reflect pending relationships, including newly named records.

The server checks every referenced owner before creating anything, then commits names,
relationships, object revisions, and the retry receipt in one transaction. Case-insensitive
dictionary matches reuse the existing record without renaming it or erasing place
coordinates. Owner-scoped client-ID mappings let later queued operations retain their
original IDs after a duplicate name resolves to an existing record. A deleted mapped
reference is rejected rather than silently recreated. Updating one person role preserves
the others; retained memberships keep their ordering, and smart collections are excluded
from manual editing. Conflict review shows names and preserves newly named records through
local/archive choices. Interrupted resolution rolls back its entire local transaction.

Proof: `verify-offline-links.mjs` covers durable graph projection, new-name reuse across
queued edits, search/filter integration, stale tabs, validation, per-field review, new and
cleared places/occasions, and complete projection of 5,001 linked objects. The expanded
`verify-sync.mjs` exercises the real functions against disposable PostgreSQL, including
foreign references, retries, aliases, independent roles, retained ordering, conflict
resolution, and forced database rollback after a new name was inserted. Existing offline
edit tests continue to pass. The browser fixture uses the real sync implementation and a
local database: people/tags/shelves and places/occasions survived disconnected reloads,
appeared in search, and synced to real rows. A concurrent tag removal triggered review;
choosing local tags restored the intended links while preserving people and collections.

This adds organization while editing an object. Standalone taxonomy renaming/deletion,
collection layout/rules/reordering, face/media changes, full archive surfaces, Map packages
and pins, capture-review recovery, HEIC cloud backup, and real-device acceptance remain.

### Phone face-viewer checkpoint

The shared phone lot sheet now uses the same front/back/detail viewer as the desktop
Cabinet and object detail. One-face objects keep a compact photograph without extra face
controls; multi-face objects have 44px controls and the existing reduced-motion behavior.
The sheet scrolls within the viewport when needed. A 390px browser fixture rendered the
actual components and verified the readable back face, detail selection, and absence of
extra controls for one face. This is phone-sized browser verification, not installed-iPhone
acceptance. Attaching/replacing/cropping/deleting back photographs offline remains separate.

Build, typecheck, and lint pass after these changes. No hosted migration, push, or deployment
has occurred.

### Offline photograph editing checkpoint

The local object view now attaches front/back/detail photographs, replaces existing
photographs, recrops saved originals, and queues removals. Camera bytes are committed
before conversion or network work. Ready changes appear immediately in the face viewer,
including a pending back face and removal of a front face. Drafts, conflicts, and local
previews carry separate status. Original bytes, preview images, crop/target JSON, and
confirmed receipts remain recoverable, including after an explicit discard. A synced
local preview can fill in until the final archive derivative has been downloaded; it
is labelled and is not stored as that derivative's exact cached bytes.

Face changes use immutable operation IDs and owner-scoped capture uploads. The face,
intake link, face revision/tombstone, and exact-payload receipt commit together. A retry
after a lost response returns the receipt without reapplying the crop over later edits.
Concurrent target changes stop for an explicit local/archive choice. Source-photo
changes also stop for review; keeping the local photograph prepares a new capture from
its retained original. Missing objects cannot be silently recreated. Stale tabs cannot
save over a submitted draft or reuse a dismissed conflict choice. Photo changes drain
separately from new-object captures, then refresh the archive snapshot.

Delayed intake processing now repairs only faces still referencing its source original.
A back-photo derive cannot overwrite the front, and an old replaced source cannot restore
its former photograph. Original and previous media blobs are retained. Cleanup only
removes newly generated derivatives known to be unused; uncertain commits retain them.
Storage reclamation remains a separate release requirement.

Proof: `verify-face-queue.mjs` passes 13 grouped scenarios covering actual IndexedDB queue
and drain code, source recovery, immutable retry, owner changes, malformed confirmations,
draft/review concurrency, original retention, and capture/face separation.
`verify-capture-face.mjs` uses real disposable PostgreSQL transactions and covers
attachment/replacement/deletion, exact replay, payload mismatch, owned sources, crop
validation, competing back additions, source/target changes during derive, full rollback
after receipt insertion, tombstones, route auth, and source-scoped repair. Existing
capture, filing, intake, metadata/link, shell, and worker regressions pass.

The desktop browser used the generated offline shell with app networking disconnected:
recropping and recovery downloads survived a fresh-tab launch; a real file-picker back
attachment saved locally and synced; a concurrent archive photo change required review.
The final viewer also displayed a pending back before sync, kept its text readable through
the flip, and removed the front locally before confirming removal in the database. Fixture
capture registration and image derivation/storage were simulated; face/sync database writes
used the actual implementations. Live Blob behavior and installed-iPhone acceptance are
not established by these tests. Build, typecheck, and lint pass.

Remaining release work includes standalone taxonomy/collection management, all archive
layouts, Map packages and pins, submitted new-object capture review, untouched HEIC cloud
backup, storage reclamation/recovery, and installed-device acceptance. No hosted migration,
push, or deployment has occurred.

### Offline indexes and navigation checkpoint

The saved archive now includes searchable People, Places, and Occasions directories,
including empty entries and names created by pending object edits. Counts use unique
linked objects and exact reference IDs; same-name places stay separate. Person pages
include notes and giver/pictured/mentioned filters. Native directory, person, and lot
URLs open the intended local view, and returning from an object preserves its filters.

Proof: `verify-offline-indexes.mjs` covers duplicates, orphan links, empty entries, local
relationship projection, exact roles, immutability, and 5,001 linked objects.
`verify-offline-navigation.mjs` passes ten scenarios using the real navigation helpers
and rendered directory component. Metadata/link, shell, and worker regressions pass.
The generated shell was exercised with app networking disconnected: native URLs,
person role filters, object return navigation, same-name place separation, and empty
occasions rendered correctly. Desktop and 390px views had no horizontal overflow.
The final worker digest matched the build before the final disconnected browser check.
Build, typecheck, and lint pass with no warnings.

This checkpoint covers directory browsing; standalone name management, collection
management, remaining archive layouts, and Map are still release work. Installed-iPhone
acceptance and hosted service verification remain separate. Nothing has been pushed.

### Submitted capture review checkpoint

A new-object filing conflict now becomes a durable review state. The submitted crop and
metadata cannot be edited in place or silently resubmitted. The review screen keeps the
original photograph and crop/details downloads available. Discarding stops the filing
attempt while retaining its local recovery copy. Creating a separate draft atomically
retains that copy and creates a fresh, unfinished draft with the same original, preview,
and details; it must be explicitly marked ready before upload. The screen explains that
an archive object may already exist and offers an online queue link before creating one.

Only a confirmed domain conflict opens review. Account mismatches, malformed responses,
and account changes during a response pause sync without inventing a conflict. Lost
acknowledgements retain the original filing identity and payload for receipt replay.

Proof: `verify-capture-review.mjs` exercises the actual IndexedDB queue and capture drain,
including conflict persistence, frozen submitted drafts, stale/owner guards, dismissal
retention, fresh draft identity, no upload before readiness, and immutable receipt replay.
`verify-capture-review-ui.mjs` passes seven scenarios using the actual rendered component
and action callbacks. Existing capture queue/sync and all 13 face-queue scenarios pass.
In the generated browser shell, two simulated filing conflicts survived disconnected
reload; one opened a separate draft with its original details, and the other was discarded
while keeping its recovery links. Both retained copies and the unfinished draft survived
another reload. Desktop and 390px review screens were inspected without horizontal
overflow. Fixture capture registration and filing responses were simulated; this does not
establish live Blob or installed-iPhone acceptance.

The online uploader also announces the number of filings needing review and links to
their local copies. Its actual component was exercised with local account/API fixtures;
the notice led to the saved conflict screen. Final build, typecheck, lint, capture/face
regressions, directory/navigation tests, and shell/worker checks pass.

Standalone taxonomy/collection management, remaining archive layouts, Map packages and
pins, untouched HEIC cloud backup, storage reclamation/recovery, and installed-device
acceptance remain release work. No hosted migration, push, or deployment has occurred.

### Offline name management scope

The next slice adds standalone renaming of existing People, Places, and Occasions entries.
Each rename keeps the entry ID and object relationships, preserves other entry metadata,
and saves an immutable operation before network work. Successive local names use the
previous name as their baseline so reconnecting can apply them in order. Names created
by a pending object edit must finish syncing before standalone renaming becomes available.
Deletion, merging names, editing person notes/place coordinates, and collection management
are separate follow-ups.

### Offline name management checkpoint

Existing people, places, and occasions can now be renamed from their local directory
pages. Pending names appear throughout search, filters, directory headings, and linked
object details. Multiple offline renames remain separate immutable operations, each based
on the previous local name. Duplicate names are refused locally and checked again by the
server. Name-only changes preserve custom initials, notes, coordinates, and relationships.

The server compares the name baseline rather than rejecting an unrelated metadata update.
A competing name requires explicit review; the owner can keep the archive name, choose a
new name, or export the local name. A deleted entry cannot be recreated through review.
Stale tabs cannot save over a newer name or reuse an old review decision. Review resolution
and outbox replacement are atomic. Server updates and retry receipts commit together, and
unique-name races roll back only the attempted update before recording a rejection.

Proof: `verify-offline-taxonomy.mjs` passes nine grouped scenarios covering actual
IndexedDB persistence, projection, ordered retries, collisions, stale tabs, conflict and
deleted-entry review, account changes, and transaction rollback. `verify-sync-taxonomy.mjs`
and the existing `verify-sync.mjs` pass against disposable local PostgreSQL databases.
Forced receipt-write failures roll back both the rename and revision; a forced unique-name
collision during update leaves no partial row and saves a replayable rejection.
Name-editor rendering, metadata/link, directory/navigation, sync, shell, and worker
regressions pass. Final build, typecheck, and lint pass.

The final generated browser shell used the real sync functions and a separate local
PostgreSQL database. With app networking disconnected, two consecutive person renames
survived reload and then synced in order. The final name reached the database while custom
initials, notes, and the person-object link remained intact. A competing database rename
opened review; the chosen local name then synced successfully. A place rename preserved
its coordinates and object link. Renaming an occasion deleted on another device stopped
for export/discard and did not recreate it. Desktop and 390px review screens were inspected
without horizontal overflow. This is local browser/database evidence, not hosted-service
or installed-iPhone acceptance.

Standalone deletion/merging, unsynced new-entry renames, other taxonomy metadata, collection
management, remaining archive layouts, Map, HEIC cloud backup, storage recovery, and
installed-device acceptance remain. No hosted migration, push, or deployment has occurred.
