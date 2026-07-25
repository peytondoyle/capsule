# capsule
Photo sharing platform — Next.js monorepo (Turborepo), Supabase. Also has an iOS app.

> **PAUSED — backend is gone (as of 2026-07-25).** Both web and iOS point at Supabase
> project `kjdoiozqefbjkbsimvbs` (peyton-prod), which was deleted in the 2026-06-28
> incident. That host now returns NXDOMAIN, so the app builds and runs but renders
> empty — the mock-data fallback in `apps/web/src/app/albums/page.tsx:28` never fires
> because `NEXT_PUBLIC_SUPABASE_URL` is still populated with the dead URL.
> The Vercel project was also deleted; `apps/web/.vercel/project.json` is stale.
>
> To revive: create a fresh Supabase project, replay the 6 migrations in
> `supabase/migrations/`, then update `apps/web/.env.local`, `supabase/config.toml`,
> the `db:types --project-id` flag in `package.json`, and
> `apps/ios/Capsule/Sources/Utilities/Config.swift:6-8`.
> While you're there: move the anon key out of `Config.swift` — it's committed in plaintext.

> Next.js has breaking changes. Check `node_modules/next/dist/docs/` before assuming APIs match training data.

## Stack
- Turborepo monorepo, apps/web (Next.js), apps/ios (Xcode)
- Supabase (database + storage)
- TypeScript

## Verify
`npm run build` — runs `build --workspace=apps/web`. Run after every edit.

## Danger Zones
- **Supabase schema / migrations**: `npm run db:migrate` affects prod — confirm before running
- **DB types**: regenerate with `npm run db:types` after schema changes

## Subagents
Spawn an Explore subagent for any file search, grep, or broad codebase exploration — keeps the main context window clean.

## Notes
- iOS app: open `apps/ios/Capsule.xcodeproj` in Xcode
