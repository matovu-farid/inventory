import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { supplyRouteItems } from "./supply-routes"
import { variants } from "./variants"

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const storeReceivings = pgTable(
  "store_receivings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    supplyRouteItemId: uuid("supply_route_item_id")
      .notNull()
      .references(() => supplyRouteItems.id, { onDelete: "restrict" }),
    receivedDate: timestamp("received_date", { withTimezone: true }).notNull(),
    quantityExpected: integer("quantity_expected").notNull(),
    quantityReceived: integer("quantity_received").notNull(),
    discrepancyNotes: text("discrepancy_notes"),
    receivedBy: text("received_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sr_store").on(table.storeId),
    index("idx_sr_item").on(table.supplyRouteItemId),
  ],
)

/**
 * Store stock — one row per (store, variant). Inventory now addresses a
 * single `variant_id` instead of the composite (product_color_id, size)
 * key it carried pre-#4. See
 * `docs/superpowers/specs/2026-05-24-category-item-variant-design.md`
 * §3 "Altered tables" and §4 step 5; the migration that performed the
 * column swap + backfill lives at `drizzle/0012_stock_variant_id.sql`.
 *
 * Related downstream tables (`store_transfer_items`, `stock_take_items`)
 * reference `store_stock.id` and pick up the variant change transitively
 * — no direct change to their schemas in this issue.
 */
export const storeStock = pgTable(
  "store_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    supplyRouteItemId: uuid("supply_route_item_id").references(
      () => supplyRouteItems.id,
      { onDelete: "restrict" },
    ),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    minimumSellPriceUgx: numeric("minimum_sell_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_ss_store").on(table.storeId),
    index("idx_ss_item").on(table.supplyRouteItemId),
    index("idx_ss_variant").on(table.variantId),
    unique("uq_ss_variant").on(table.storeId, table.variantId),
  ],
)

// Relations
export const storeRelations = relations(stores, ({ many }) => ({
  receivings: many(storeReceivings),
  stock: many(storeStock),
}))

export const storeReceivingRelations = relations(storeReceivings, ({ one }) => ({
  store: one(stores, {
    fields: [storeReceivings.storeId],
    references: [stores.id],
  }),
  supplyRouteItem: one(supplyRouteItems, {
    fields: [storeReceivings.supplyRouteItemId],
    references: [supplyRouteItems.id],
  }),
  receivedByUser: one(user, {
    fields: [storeReceivings.receivedBy],
    references: [user.id],
  }),
}))

export const storeStockRelations = relations(storeStock, ({ one }) => ({
  store: one(stores, {
    fields: [storeStock.storeId],
    references: [stores.id],
  }),
  supplyRouteItem: one(supplyRouteItems, {
    fields: [storeStock.supplyRouteItemId],
    references: [supplyRouteItems.id],
  }),
  variant: one(variants, {
    fields: [storeStock.variantId],
    references: [variants.id],
  }),
}))
