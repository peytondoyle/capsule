# Backlog

status: written 2026-09-15 (ops-W17) in the shared row shape. Rows copied verbatim from
`~/Astra/out/capsule/BACKLOG.md` §5 (accepted 2026-09-08, RULING CAPSULE-BACKLOG-CANDIDATES-20260908)
and §6 (integration follow-ups, 2026-09-13); only unstarted rows are here (C1, C4 and C6+F1
shipped as W15, W16, W17). Order: cleanup first, then features; no migration is ever applied by
the builder. Device / installed-PWA acceptance and anything visual beyond plain wiring stay
Claude/Peyton. The next row is named in `~ops/track/TRACK.md` § Queue.

Row shape: `id | scope | files | depends on | acceptance | credential-free y/n`.
"credential-free" = the task and the gates the builder runs need no hosted database, key or token
(y where the source names none; n where it names a scratch cluster or hosted measurement).

| id | scope | files | depends on | acceptance | credential-free |
|---|---|---|---|---|---|
| capsule-F4 | F4 enforce share expiry in the UI (expired share renders the expired state, not the object). | — | — | expired share renders the expired state, not the object | y |
| capsule-FU-1 | FU-1 verify-offline-media socket: scripts/verify-offline-media.mjs line 12 hardcodes `host: '/private/tmp'`; make it `process.env.CAPSULE_TEST_PG_SOCKET ?? '/private/tmp'` exactly as scripts/verify-sync.mjs line 15 already does. One file, one line, no other change. Proof: the script still passes on a scratch cluster at the default socket and passes when CAPSULE_TEST_PG_SOCKET points elsewhere. Routed to the lane as a one-file package after W17 and F4; Sonnet-shaped. | scripts/verify-offline-media.mjs | after W17 and F4 | the script still passes on a scratch cluster at the default socket and passes when CAPSULE_TEST_PG_SOCKET points elsewhere | n (scratch Postgres cluster) |
| capsule-C3 | C3 dead activity table: remove the code paths; write the DROP as a FILE-ONLY migration with a rollout note; Peyton decides the apply. | — | — | FILE-ONLY migration with a rollout note; Peyton decides the apply | y |
| capsule-C2 | C2 sign-up gate: single-tenant; gate new sign-ups behind an allowlist env var (Peyton's identity is never locked out; document the var). Investigation-first: list the write sites first in READY, then implement. | — | — | investigation-first: list the write sites first, then implement | y |
| capsule-F6 | F6 promote a detail face to recto/verso. | — | — | — | y |
| capsule-F2 | F2 browse by tag (index + detail pair, existing components, no new design system). | — | — | existing components, no new design system | y |
| capsule-F3 | F3 durable share view counter: FILE-ONLY migration + code behind it; Peyton decides the apply. | — | — | FILE-ONLY migration; Peyton decides the apply | y |
| capsule-F5 | F5 undo a mistaken delete: INVESTIGATION ONLY first (what is soft-deletable today, what Blob objects would be orphaned); no implementation until a Claude ruling on the design. | — | — | INVESTIGATION ONLY; no implementation until a Claude ruling on the design | y |
| capsule-FU-2 | FU-2 patchWithShelfDependencies cost: the offline sync `object.patchWithShelfDependencies` path (src/server/sync.ts, added by W13) runs 3 sequential queries per dependency inside the owner's pg_advisory_xact_lock, validator-capped at 400 dependencies, ~1,200 round trips worst case, unmeasured. No existing request path gained cost and the realistic list is one or a few. Investigation-first: measure the per-dependency cost on a scratch cluster at 1, 10, 100 and 400 dependencies, report the numbers in READY, and propose either a lower validator cap or a batched query shape. No implementation until a Claude ruling on the numbers. Not routed yet; runs after FU-1. | src/server/sync.ts | after FU-1 | numbers reported at 1, 10, 100 and 400 dependencies; no implementation until a Claude ruling on the numbers | n (scratch Postgres cluster) |
