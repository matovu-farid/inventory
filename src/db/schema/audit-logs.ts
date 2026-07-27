import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    description: text('description').notNull(),
    articleNumbers: text('article_numbers')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    businessDate: timestamp('business_date', { withTimezone: true }),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_actor').on(table.actorUserId),
    index('idx_audit_entity').on(table.entityType, table.entityId),
    index('idx_audit_action').on(table.action),
    index('idx_audit_created_at').on(table.createdAt),
    index('idx_audit_business_date').on(table.businessDate),
    index('idx_audit_articles').using('gin', table.articleNumbers),
  ],
)
