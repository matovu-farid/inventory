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
import { itemCategories } from './item-categories'
import { itemColorImages } from './item-color-images'

/**
 * Catalog: items and item_colors. After the items-free-text-category change
 * (drizzle/0018_items_category_text.sql) categories live as a plain text
 * column here instead of an FK to a separate table — the combobox in
 * item-editor.tsx autocompletes from existing values.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    articleNumber: text('article_number').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * Free-text catalog grouping. NOT NULL — every item has a category.
     * The set of categories on the system is implicit in the distinct
     * values of this column; the UI combobox sources its options from
     * `listItemCategories()`.
     */
    category: text('category').notNull(),
    categoryId: uuid('category_id').references(() => itemCategories.id, {
      onDelete: 'restrict',
    }),
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
    lowStockThreshold: integer('low_stock_threshold'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_items_article').on(table.articleNumber),
    index('idx_items_category').on(table.category),
  ],
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
  categoryRecord: one(itemCategories, {
    fields: [items.categoryId],
    references: [itemCategories.id],
  }),
  colors: many(itemColors),
  // `variants` (one row per item × color × size) was added in #2 and is
  // now the unit of stock since #4 / #5 / #6.
  variants: many(variants),
  // Store stock rows that point at this item — includes both variant-
  // keyed lots and unresolved (variant_id NULL) lots.
  storeStockRows: many(storeStock),
}))

export const itemColorRelations = relations(itemColors, ({ one, many }) => ({
  item: one(items, {
    fields: [itemColors.itemId],
    references: [items.id],
  }),
  images: many(itemColorImages),
}))
