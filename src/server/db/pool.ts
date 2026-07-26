import 'server-only'

import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'

/**
 * WebSocket-backed client, used **only** where a real transaction is needed.
 *
 * `drizzle-orm/neon-http` (see ./index.ts) talks to Neon over stateless HTTP and
 * cannot hold a transaction open across statements, which is fine for every
 * ordinary read and single-statement write and much cheaper per call. Lot
 * allocation is the one place that genuinely needs BEGIN…COMMIT: the counter
 * increment and the object insert have to succeed or fail together, or a failed
 * insert burns a lot number and OBJ-0148 follows OBJ-0146.
 *
 * The pooled DATABASE_URL is correct here — pgbouncer's transaction mode pins a
 * server connection for the life of a transaction.
 */
function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  // Node 22+ ships a global WebSocket; the driver needs it named explicitly.
  if (!neonConfig.webSocketConstructor && typeof WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = WebSocket
  }

  return drizzle(new Pool({ connectionString: url }), { schema })
}

let txDb: ReturnType<typeof create> | null = null

export function getTxDb() {
  if (!txDb) txDb = create()
  return txDb
}
