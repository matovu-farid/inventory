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
import { products, productColors } from './products'

/**
 * Variants — one row per (item, color, size) combination. This is the
 * first stage of the 3-layer catalog (item_categories → items → variants);
 * the FK columns still point at the current `products` / `product_colors`
 * tables (the rename to `items` / `item_colors` ships in a later issue).
 *
 * Stock, sales, transfers, and notification tables still address inventory
 * via `(product_color_id, size)`. Swapping them to `variant_id` is the next
 * issue; this slice only adds the table and backfills it.
 */
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    colorId: uuid('color_id')
      .notNull()
      .references(() => productColors.id, { onDelete: 'restrict' }),
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
  item: one(products, {
    fields: [variants.itemId],
    references: [products.id],
  }),
  color: one(productColors, {
    fields: [variants.colorId],
    references: [productColors.id],
  }),
}))
