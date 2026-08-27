import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  numeric,
  integer,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
// `variants` and `storeStock` are imported only as relation targets — the
// cyclical pairings (variants ↔ items, storeStock ↔ items) are harmless
// because Drizzle's `relations()` helper resolves lazily at first query.
import { variants } from './variants'
import { storeStock } from './store'
import { suppliers } from './suppliers'
import { itemArticleNumbers } from './item-article-numbers'
import { itemColorImages } from './item-color-images'
import { itemImages } from './item-images'

/**
 * Catalog: items and item_colors. Item-level commercial data is shared by all
 * article numbers in item_article_numbers.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    design: text('design').notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'restrict',
    }),
    costPrice: numeric('cost_price', { precision: 15, scale: 2 }),
    costCurrency: text('cost_currency'),
    minimumSellPriceUgx: numeric('minimum_sell_price_ugx', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_items_design').on(table.design)],
)

export const itemColors = pgTable(
  'item_colors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    colorName: text('color_name').notNull(),
    colorHex: text('color_hex').notNull(),
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
    index('idx_ic_item').on(table.itemId),
    index('idx_ic_unique').on(table.itemId, table.colorName),
  ],
)

export const itemRelations = relations(items, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [items.supplierId],
    references: [suppliers.id],
  }),
  colors: many(itemColors),
  articleNumbers: many(itemArticleNumbers),
  // `variants` (one row per item × color × size) was added in #2 and is
  // now the unit of stock since #4 / #5 / #6.
  variants: many(variants),
  // Store stock rows that point at this item — includes both variant-
  // keyed lots and unresolved (variant_id NULL) lots.
  storeStockRows: many(storeStock),
  images: many(itemImages),
}))

export const itemColorRelations = relations(itemColors, ({ one, many }) => ({
  item: one(items, {
    fields: [itemColors.itemId],
    references: [items.id],
  }),
  images: many(itemColorImages),
}))
