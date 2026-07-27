import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

export const adminIpAllowlist = pgTable(
  'admin_ip_allowlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ip: text('ip').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('admin_ip_allowlist_user_ip_idx').on(t.userId, t.ip),
    index('admin_ip_allowlist_user_idx').on(t.userId),
    index('admin_ip_allowlist_ip_idx').on(t.ip),
  ],
)

export const ipBlockLog = pgTable(
  'ip_block_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    ip: text('ip').notNull(),
    path: text('path'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('ip_block_log_attempted_at_idx').on(t.attemptedAt)],
)

export const adminIpAllowlistRelations = relations(
  adminIpAllowlist,
  ({ one }) => ({
    user: one(user, {
      fields: [adminIpAllowlist.userId],
      references: [user.id],
    }),
  }),
)

export const ipBlockLogRelations = relations(ipBlockLog, ({ one }) => ({
  user: one(user, {
    fields: [ipBlockLog.userId],
    references: [user.id],
  }),
}))
