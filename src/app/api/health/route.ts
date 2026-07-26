import { sql } from 'drizzle-orm'

import { getDb } from '@/server/db'

/**
 * Liveness + database reachability. Deliberately leaks nothing: booleans and the
 * runtime's own version, never connection details or error text.
 */
export async function GET() {
  let database = false
  try {
    await getDb().execute(sql`select 1`)
    database = true
  } catch {
    database = false
  }

  return Response.json(
    { ok: database, database, node: process.version, region: process.env.VERCEL_REGION ?? null },
    { status: database ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
