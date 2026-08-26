import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { items } from './items'

export const itemArticleNumbers = pgTable(
  'item_article_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    articleNumber: text('article_number').notNull(),
    // Orphaned legacy catalog rows may not have a supplier. New and
    // supplier-owned rows always receive a qualified value in server code.
    qualifiedArticleNumber: text('qualified_article_number'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_item_article_numbers_qualified').on(
      table.qualifiedArticleNumber,
    ),
    index('idx_item_article_numbers_item').on(table.itemId),
  ],
)

export const itemArticleNumberRelations = relations(
  itemArticleNumbers,
  ({ one }) => ({
    item: one(items, {
      fields: [itemArticleNumbers.itemId],
      references: [items.id],
    }),
  }),
)
