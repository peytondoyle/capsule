# capsule
Photo sharing platform — Next.js monorepo (Turborepo), Supabase. Also has an iOS app.

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
