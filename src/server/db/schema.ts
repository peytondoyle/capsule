import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Mirror of Clerk users, kept in sync by /api/webhooks/clerk.
 *
 * v1 had a `handle_new_user` Postgres function for this but no migration ever
 * created the trigger, so profiles never auto-created. The webhook is the
 * explicit replacement.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Per-owner lot allocation. `objects.lot_no` is gapless and owner-scoped so it
 * can render as OBJ-0147 / LOT 0147; a shared sequence would leak other
 * people's volume and leave gaps.
 */
export const ownerCounters = pgTable('owner_counters', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  nextLot: integer('next_lot').notNull().default(1),
})
