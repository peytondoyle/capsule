#!/usr/bin/env bash
# Re-push the Neon connection variables from .env.local to Vercel.
#
# Deleting the old Vercel Marketplace resource disconnects the `capsule-db`
# store, and that store still claims these sixteen names — overwriting a value
# with `vercel env add --force` does not detach it. So the disconnect may take
# all sixteen with it, on all three targets.
#
# It does not show up as a failed build. `src/server/db/index.ts` builds its
# client lazily on purpose, so `next build` succeeds with no DATABASE_URL at
# all and the deployment goes green — then every authed page 500s. Check
# `vercel env ls production` after the delete, not the build status.
#
#   ./scripts/restore-vercel-env.sh            # re-push all three targets
#   ./scripts/restore-vercel-env.sh production # one target
set -euo pipefail
cd "$(dirname "$0")/.."

KEYS=(DATABASE_URL DATABASE_URL_UNPOOLED NEON_PROJECT_ID PGDATABASE PGHOST
      PGHOST_UNPOOLED PGPASSWORD PGUSER POSTGRES_DATABASE POSTGRES_HOST
      POSTGRES_PASSWORD POSTGRES_PRISMA_URL POSTGRES_URL
      POSTGRES_URL_NON_POOLING POSTGRES_URL_NO_SSL POSTGRES_USER)

TARGETS=("${@:-production preview development}")
read -ra TARGETS <<< "${TARGETS[*]}"

for target in "${TARGETS[@]}"; do
  for key in "${KEYS[@]}"; do
    value=$(grep -E "^${key}=" .env.local | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
    if [ -z "$value" ]; then
      echo "MISSING in .env.local: $key" >&2
      exit 1
    fi
    if npx vercel env add "$key" "$target" --force --yes --value "$value" >/dev/null 2>&1; then
      echo "ok   $key $target"
    else
      echo "FAIL $key $target" >&2
    fi
  done
done

echo
echo "Now confirm, then deploy:"
echo "  npx vercel env ls production"
echo "  npx vercel --prod && curl -sS https://capsule-omega-ruby.vercel.app/api/health"
