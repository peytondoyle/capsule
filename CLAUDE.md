@AGENTS.md

## Secrets

Values live in Infisical project `capsule` (envs `dev` / `staging` / `prod`), synced to the
Vercel project `capsule` (development / preview / production). `npm run dev` wraps
`infisical run --env=dev`, so there is no `.env.local` to maintain and agents cannot read one.
Never hand-edit Vercel env and never print a value: the rules are in the workspace CLAUDE.md
(`~/Documents/Development/CLAUDE.md`, `## Secrets`).
Deploy: a merge deploys nothing; Peyton runs `vercel --prod --yes` from a clean `master`.
