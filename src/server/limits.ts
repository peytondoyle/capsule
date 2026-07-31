import 'server-only'

import { and, eq, lt, sql } from 'drizzle-orm'

import { getDb } from './db'
import { apiUsage } from './db/schema'

/**
 * Per-owner hourly caps on the endpoints that cost money or CPU.
 *
 * In Postgres rather than memory or a regional cache, because a serverless
 * function has neither a process nor a region that outlives the request: an
 * in-memory counter resets on every cold start and is per-instance besides,
 * which is to say it does not limit anything. The upsert below is one
 * round-trip and returns the new count in the same statement.
 *
 * Sign-up is public and /api/extract bills Anthropic per call, so this is the
 * only thing between an account anyone can create and an unbounded invoice.
 */
export const LIMITS = {
  /** A vision call per intake item. A heavy real session is a few dozen. */
  extract: 120,
  /** sharp CPU plus two Blob writes; re-cuts are legitimate and cheap-ish. */
  derive: 400,
} as const

export type LimitedEndpoint = keyof typeof LIMITS

export type LimitResult = {
  ok: boolean
  /** Calls used in the current window, including this one. */
  used: number
  limit: number
  /** Seconds until the window rolls over — the Retry-After value. */
  resetIn: number
}

const HOUR_MS = 3_600_000

/**
 * Counts one call and reports whether it was allowed.
 *
 * Deliberately counts the call even when it is over the limit: a caller
 * hammering the endpoint should not get a free reset by being refused, and the
 * count is what makes the refusal stable across instances.
 */
export async function consume(
  ownerId: string,
  endpoint: LimitedEndpoint,
  now = Date.now(),
): Promise<LimitResult> {
  const db = getDb()
  const window = Math.floor(now / HOUR_MS)
  const limit = LIMITS[endpoint]

  const [row] = await db
    .insert(apiUsage)
    .values({ ownerId, endpoint, window, calls: 1 })
    .onConflictDoUpdate({
      target: [apiUsage.ownerId, apiUsage.endpoint, apiUsage.window],
      set: { calls: sql`${apiUsage.calls} + 1` },
    })
    .returning({ calls: apiUsage.calls })

  const used = row?.calls ?? 1
  const resetIn = Math.ceil(((window + 1) * HOUR_MS - now) / 1000)

  // Opportunistic sweep, roughly one call in fifty, so the table cannot grow
  // without bound and nothing needs a cron to say so.
  if (used % 50 === 0) {
    await db.delete(apiUsage).where(lt(apiUsage.window, window - 24)).catch(() => undefined)
  }

  return { ok: used <= limit, used, limit, resetIn }
}

/** Reads the current count without spending one. */
export async function peek(
  ownerId: string,
  endpoint: LimitedEndpoint,
  now = Date.now(),
): Promise<number> {
  const window = Math.floor(now / HOUR_MS)
  const [row] = await getDb()
    .select({ calls: apiUsage.calls })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.ownerId, ownerId),
        eq(apiUsage.endpoint, endpoint),
        eq(apiUsage.window, window),
      ),
    )
    .limit(1)
  return row?.calls ?? 0
}

/** 429 with the headers a client can actually act on. */
export function tooManyRequests(result: LimitResult) {
  return Response.json(
    {
      error: 'too many requests',
      retryAfter: result.resetIn,
    },
    {
      status: 429,
      headers: {
        'retry-after': String(result.resetIn),
        'x-ratelimit-limit': String(result.limit),
        'x-ratelimit-remaining': '0',
      },
    },
  )
}
