/**
 * Points the proof gates at the Neon `verify` branch, and refuses to run
 * without one.
 *
 * The gates are not read-only: verify-p2 allocates a dozen lots to prove the
 * counter is gapless, and verify-p6 uploads a real photograph, files it as an
 * object and deletes it again. `.env.local` and Production share a single Neon
 * endpoint, so all of that was landing in the live archive — the same rows the
 * gates then assert about. A leftover probe titled like a fixture is exactly
 * how verify-p2 started failing.
 *
 * `verify` is a copy-on-write branch of `main`, so it already holds the
 * fixtures and costs nothing until a gate touches it. Import this before
 * anything imports src/server/db — getDb() reads process.env lazily, but only
 * once.
 */
// Not `useVerificationBranch` — the `use` prefix makes eslint enforce the
// rules of hooks on it.
export function requireVerificationBranch() {
  const verify = process.env.DATABASE_URL_VERIFY
  const verifyUnpooled = process.env.DATABASE_URL_UNPOOLED_VERIFY

  if (verify) {
    process.env.DATABASE_URL = verify
    process.env.DATABASE_URL_UNPOOLED = verifyUnpooled ?? verify
    console.log(`  db  ${hostOf(verify)}  (branch: verify)`)
    return
  }

  if (process.argv.includes('--allow-prod')) {
    console.warn(
      `\n  !!  running against ${hostOf(process.env.DATABASE_URL ?? '')} with no verify branch.` +
        `\n  !!  this gate writes and deletes objects. --allow-prod was passed, continuing.\n`,
    )
    return
  }

  throw new Error(
    'DATABASE_URL_VERIFY is not set.\n\n' +
      'The proof gates create and delete real objects, so they must not run against the\n' +
      'archive. Create a branch and put its two URLs in .env.local:\n\n' +
      '  neonctl branches create --project-id $NEON_PROJECT_ID --name verify\n\n' +
      '  DATABASE_URL_VERIFY="…-pooler.…neon.tech/neondb?sslmode=require"\n' +
      '  DATABASE_URL_UNPOOLED_VERIFY="…neon.tech/neondb?sslmode=require"\n\n' +
      'Pass --allow-prod to override, knowing what it does.',
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return '(unparseable)'
  }
}
