import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { locationTypeEnum } from './expenses'
import { storeStock } from './store'
import { shopStock } from './shops'
import { items } from './items'
import { variants } from './variants'

export const stockTakeStatusEnum = pgEnum('stock_take_status', [
  'in_progress',
  'completed',
  'reconciled',
])

export const stockTakes = pgTable(
  'stock_takes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationType: locationTypeEnum('location_type').notNull(),
    locationId: uuid('location_id').notNull(),
    stockTakeDate: timestamp('stock_take_date', {
      withTimezone: true,
    }).notNull(),
    status: stockTakeStatusEnum('status').notNull().default('in_progress'),
    conductedBy: text('conducted_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_stk_location').on(table.locationType, table.locationId),
    index('idx_stk_date').on(table.stockTakeDate),
  ],
)

export const stockTakeLines = pgTable(
  'stock_take_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stockTakeId: uuid('stock_take_id')
      .notNull()
      .references(() => stockTakes.id, { onDelete: 'cascade' }),
    storeStockId: uuid('store_stock_id').references(() => storeStock.id, {
      onDelete: 'restrict',
    }),
    shopStockId: uuid('shop_stock_id').references(() => shopStock.id, {
      onDelete: 'restrict',
    }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    itemName: text('product_name').notNull(),
    systemQuantity: integer('system_quantity').notNull(),
    physicalQuantity: integer('physical_quantity').notNull(),
    discrepancy: integer('discrepancy').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_stkl_take').on(table.stockTakeId),
    index('idx_stkl_item').on(table.itemId),
    index('idx_stkl_variant').on(table.variantId),
  ],
)

// Relations
export const stockTakeRelations = relations(stockTakes, ({ one, many }) => ({
  conductedByUser: one(user, {
    fields: [stockTakes.conductedBy],
    references: [user.id],
  }),
  // Relation key `items` retained as a stable JS API (see supply-routes.ts).
  // Underlying table is now `stock_take_lines` (#8).
  items: many(stockTakeLines),
}))

export const stockTakeLineRelations = relations(stockTakeLines, ({ one }) => ({
  stockTake: one(stockTakes, {
    fields: [stockTakeLines.stockTakeId],
    references: [stockTakes.id],
  }),
  storeStockItem: one(storeStock, {
    fields: [stockTakeLines.storeStockId],
    references: [storeStock.id],
  }),
  shopStockItem: one(shopStock, {
    fields: [stockTakeLines.shopStockId],
    references: [shopStock.id],
  }),
  item: one(items, {
    fields: [stockTakeLines.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [stockTakeLines.variantId],
    references: [variants.id],
  }),
}))
