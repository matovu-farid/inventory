import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { stores, storeStock } from "./store"
import { shops } from "./shops"

export const transferStatusEnum = pgEnum("transfer_status", [
  "pending",
  "dispatched",
  "received",
  "reconciled",
])

export const storeTransfers = pgTable(
  "store_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    transferDate: timestamp("transfer_date", { withTimezone: true }).notNull(),
    status: transferStatusEnum("status").notNull().default("pending"),
    dispatchedBy: text("dispatched_by").references(() => user.id, { onDelete: "restrict" }),
    receivedBy: text("received_by").references(() => user.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_st_store").on(table.storeId),
    index("idx_st_shop").on(table.shopId),
    index("idx_st_status").on(table.status),
  ],
)

export const storeTransferLines = pgTable(
  "store_transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeTransferId: uuid("store_transfer_id")
      .notNull()
      .references(() => storeTransfers.id, { onDelete: "cascade" }),
    storeStockId: uuid("store_stock_id")
      .notNull()
      .references(() => storeStock.id, { onDelete: "restrict" }),
    quantityDispatched: integer("quantity_dispatched").notNull(),
    quantityReceived: integer("quantity_received"),
    discrepancyNotes: text("discrepancy_notes"),
    unitPriceUgx: numeric("unit_price_ugx", { precision: 15, scale: 2 }).notNull(),
    totalPriceUgx: numeric("total_price_ugx", { precision: 15, scale: 2 }).notNull(),
    /** Minimum sell price the shop must charge customers for this item.
     *  Set by the dispatcher; defaults to store cost-per-unit. */
    minimumSellPriceUgx: numeric("minimum_sell_price_ugx", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_stl_transfer").on(table.storeTransferId)],
)

// Relations
export const storeTransferRelations = relations(storeTransfers, ({ one, many }) => ({
  store: one(stores, {
    fields: [storeTransfers.storeId],
    references: [stores.id],
  }),
  shop: one(shops, {
    fields: [storeTransfers.shopId],
    references: [shops.id],
  }),
  dispatchedByUser: one(user, {
    fields: [storeTransfers.dispatchedBy],
    references: [user.id],
    relationName: "dispatchedBy",
  }),
  receivedByUser: one(user, {
    fields: [storeTransfers.receivedBy],
    references: [user.id],
    relationName: "receivedBy",
  }),
  // Relation key `items` retained as a stable JS API (see supply-routes.ts).
  // Underlying table is now `store_transfer_lines` (#8).
  items: many(storeTransferLines),
}))

export const storeTransferLineRelations = relations(storeTransferLines, ({ one }) => ({
  storeTransfer: one(storeTransfers, {
    fields: [storeTransferLines.storeTransferId],
    references: [storeTransfers.id],
  }),
  storeStockItem: one(storeStock, {
    fields: [storeTransferLines.storeStockId],
    references: [storeStock.id],
  }),
}))
