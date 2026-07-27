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
import { items } from './items'
import { supplyRouteLines } from './supply-routes'
import { variants } from './variants'

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const storeReceivings = pgTable(
  'store_receivings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    // Renamed from `supply_route_item_id` in Phase 2 (#8) when the source
    // table was renamed `supply_route_items` → `supply_route_lines`.
    supplyRouteLineId: uuid('supply_route_line_id')
      .notNull()
      .references(() => supplyRouteLines.id, { onDelete: 'restrict' }),
    receivedDate: timestamp('received_date', { withTimezone: true }).notNull(),
    quantityExpected: integer('quantity_expected').notNull(),
    quantityReceived: integer('quantity_received').notNull(),
    discrepancyNotes: text('discrepancy_notes'),
    receivedBy: text('received_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_sr_store').on(table.storeId),
    index('idx_sr_line').on(table.supplyRouteLineId),
  ],
)

/**
 * Store stock — one row per (store, item, variant_or_null, supply_route_line).
 * The variant-flexibility change (see
 * `docs/superpowers/specs/2026-05-31-variant-flexibility-design.md`) makes
 * `item_id` the primary stock anchor and `variant_id` an optional refinement:
 * a NULL `variant_id` means the lot hasn't been split into a specific
 * (color, size) yet ("unresolved" stock). The new
 * `uq_ss_store_item_variant_line` constraint uses `NULLS NOT DISTINCT` so
 * at most one unresolved row exists per (store, item, supply line).
 *
 * Cost per unit stays per row (lot-specific). Minimum sell price moved up
 * to `items.minimum_sell_price_ugx` — it's an item-wide floor now, not a
 * per-lot setting.
 */
export const storeStock = pgTable(
  'store_stock',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    // Renamed from `supply_route_item_id` in Phase 2 (#8) when the source
    // table was renamed `supply_route_items` → `supply_route_lines`.
    supplyRouteLineId: uuid('supply_route_line_id').references(
      () => supplyRouteLines.id,
      { onDelete: 'restrict' },
    ),
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
    index('idx_ss_store').on(table.storeId),
    index('idx_ss_item').on(table.itemId),
    index('idx_ss_line').on(table.supplyRouteLineId),
    index('idx_ss_variant').on(table.variantId),
    // Replaces the old uq_ss_variant. Postgres 15+ NULLS NOT DISTINCT
    // means at most one (store, item, NULL variant, line) row.
    unique('uq_ss_store_item_variant_line')
      .on(table.storeId, table.itemId, table.variantId, table.supplyRouteLineId)
      .nullsNotDistinct(),
  ],
)

// Relations
export const storeRelations = relations(stores, ({ many }) => ({
  receivings: many(storeReceivings),
  stock: many(storeStock),
}))

export const storeReceivingRelations = relations(
  storeReceivings,
  ({ one }) => ({
    store: one(stores, {
      fields: [storeReceivings.storeId],
      references: [stores.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [storeReceivings.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
    receivedByUser: one(user, {
      fields: [storeReceivings.receivedBy],
      references: [user.id],
    }),
  }),
)

export const storeStockRelations = relations(storeStock, ({ one }) => ({
  store: one(stores, {
    fields: [storeStock.storeId],
    references: [stores.id],
  }),
  item: one(items, {
    fields: [storeStock.itemId],
    references: [items.id],
  }),
  supplyRouteLine: one(supplyRouteLines, {
    fields: [storeStock.supplyRouteLineId],
    references: [supplyRouteLines.id],
  }),
  variant: one(variants, {
    fields: [storeStock.variantId],
    references: [variants.id],
  }),
}))
