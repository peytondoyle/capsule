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


/* ------------------------------------------------------------------ *
 * Shared gate plumbing
 *
 * Every gate had its own byte-identical copy of these, and they had already
 * drifted — one printed "all passed" where the others printed "all checks
 * passed", and the three owner resolvers disagreed about what to do when
 * --owner was absent. Live here so a gate is the assertions and nothing else.
 * ------------------------------------------------------------------ */

let failed = 0

export function check(label: string, pass: boolean, detail = '') {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!pass) failed++
}

export function failures() {
  return failed
}

/** `--owner <id>`, or the archive's single user. Explicit about ambiguity. */
export function resolveOwner(argv: string[], users: { id: string }[]) {
  const i = argv.indexOf('--owner')
  if (i > -1) {
    const value = argv[i + 1]
    // indexOf + 1 lands on undefined when the flag is last, which then reads as
    // "no owner given" and silently falls through to the first user.
    if (!value || value.startsWith('--')) throw new Error('--owner needs a value')
    return value
  }
  if (users.length === 1) return users[0]!.id
  throw new Error(
    users.length === 0
      ? 'no users on this branch; pass --owner <clerk id>'
      : `${users.length} users found; pass --owner <clerk id>`,
  )
}
