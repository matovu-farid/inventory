import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { variants } from './variants'
import { items } from './items'
import { supplyRouteLines } from './supply-routes'

export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  managerId: text('manager_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

/**
 * Shop stock — one row per (shop, variant). Inventory now addresses a
 * single `variant_id` instead of the composite (product_color_id, size)
 * key it carried pre-#4. See
 * `docs/superpowers/specs/2026-05-24-category-item-variant-design.md`
 * §3 "Altered tables" and §4 step 5; the migration that performed the
 * column swap + backfill lives at `drizzle/0012_stock_variant_id.sql`.
 *
 * Related downstream tables (`shop_sale_lines`, `shop_return_lines`,
 * `stock_take_lines`) reference `shop_stock.id` and pick up the variant
 * change transitively — no direct change to their schemas in this issue.
 */
export const shopStock = pgTable(
  'shop_stock',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    // Carries the original purchase lot from supply through store → shop.
    // Two shop_stock rows for the same (shop, item, variant) but different
    // supply lines stay separate so per-lot cost is preserved.
    supplyRouteLineId: uuid('supply_route_line_id').references(
      () => supplyRouteLines.id,
      { onDelete: 'restrict' },
    ),
    storeTransferItemId: uuid('store_transfer_item_id'),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    costPerUnitUgx: numeric('cost_per_unit_ugx', {
      precision: 15,
      scale: 2,
    }).notNull(),
    minimumSellPriceUgx: numeric('minimum_sell_price_ugx', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_shst_shop').on(table.shopId),
    index('idx_shst_item').on(table.itemId),
    index('idx_shst_variant').on(table.variantId),
    index('idx_shst_line').on(table.supplyRouteLineId),
    index('idx_shst_transfer_item').on(table.storeTransferItemId),
    // Replaces uq_shst_variant. NULLS NOT DISTINCT means at most one
    // (shop, item, NULL variant, NULL line) row.
    unique('uq_shst_shop_item_variant_line')
      .on(table.shopId, table.itemId, table.variantId, table.supplyRouteLineId)
      .nullsNotDistinct(),
  ],
)

// Relations
export const shopRelations = relations(shops, ({ one, many }) => ({
  manager: one(user, { fields: [shops.managerId], references: [user.id] }),
  stock: many(shopStock),
}))

export const shopStockRelations = relations(shopStock, ({ one }) => ({
  shop: one(shops, {
    fields: [shopStock.shopId],
    references: [shops.id],
  }),
  item: one(items, {
    fields: [shopStock.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [shopStock.variantId],
    references: [variants.id],
  }),
  supplyRouteLine: one(supplyRouteLines, {
    fields: [shopStock.supplyRouteLineId],
    references: [supplyRouteLines.id],
  }),
}))
