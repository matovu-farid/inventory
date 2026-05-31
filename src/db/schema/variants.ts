import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { items, itemColors } from './items'

/**
 * Variants — one row per (item, color, size) combination. Forms the
 * leaf of the catalog (items → variants); the FK columns point at the
 * renamed `items` / `item_colors` tables (rename landed in issue #3).
 *
 * Stock, sales, transfers, and notification tables still address inventory
 * via `(product_color_id, size)` — that column-name swap to `variant_id`
 * is owned by issues #4 / #5 and intentionally out of scope here.
 */
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    colorId: uuid('color_id')
      .notNull()
      .references(() => itemColors.id, { onDelete: 'restrict' }),
    size: text('size').notNull(),
    barcode: text('barcode'),
    imageS3Key: text('image_s3_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('uq_variant_item_color_size').on(
      table.itemId,
      table.colorId,
      table.size,
    ),
    uniqueIndex('uq_variant_barcode')
      .on(table.barcode)
      .where(sql`barcode IS NOT NULL`),
    index('idx_variant_item').on(table.itemId),
    index('idx_variant_color').on(table.colorId),
  ],
)

export const variantRelations = relations(variants, ({ one }) => ({
  item: one(items, {
    fields: [variants.itemId],
    references: [items.id],
  }),
  color: one(itemColors, {
    fields: [variants.colorId],
    references: [itemColors.id],
  }),
}))
