import 'server-only'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from './schema'

function create() {
  const url = process.env.DATABASE_URL
  // Next evaluates top-level module code at build time, so constructing the
  // client eagerly would crash `next build` before env vars exist.
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema })
}

let db: ReturnType<typeof create> | null = null

/**
 * Lazy singleton. Deliberately a function, not a Proxy — Proxy-wrapped clients
 * break libraries that introspect the adapter object.
 */
export function getDb() {
  if (!db) db = create()
  return db
}
