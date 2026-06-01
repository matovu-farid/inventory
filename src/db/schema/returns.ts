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
import { shops, shopStock } from "./shops"
import { stores } from "./store"
import { user } from "./auth"
import { bankAccounts } from "./bank-accounts"
import { shopSales } from "./sales"
import { storeTransfers } from "./transfers"
import { customers } from "./customers"
import { supplyRouteLines } from "./supply-routes"
import { items } from "./items"
import { variants } from "./variants"

export const refundMethodEnum = pgEnum("refund_method", [
  "cash",
  "bank",
  "credit_adjustment",
])

export const storeReturnStatusEnum = pgEnum("store_return_status", [
  "dispatched",
  "received",
  "reconciled",
])

// ============== Customer → Shop returns ==============

export const shopReturns = pgTable(
  "shop_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    originalSaleId: uuid("original_sale_id").references(() => shopSales.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    returnDate: timestamp("return_date", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    refundMethod: refundMethodEnum("refund_method").notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    totalRefund: numeric("total_refund", { precision: 15, scale: 2 }).notNull(),
    approvedBy: text("approved_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    receivedBy: text("received_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    documentNumber: text("document_number").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sr_shop").on(table.shopId),
    index("idx_sr_date").on(table.returnDate),
    index("idx_sr_customer").on(table.customerId),
  ],
)

export const shopReturnLines = pgTable(
  "shop_return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopReturnId: uuid("shop_return_id")
      .notNull()
      .references(() => shopReturns.id, { onDelete: "cascade" }),
    // Plan 2b: item identity is denormalized on the line, variant is
    // optional, and the lot breakdown lives in shop_return_line_allocations.
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    shopStockId: uuid("shop_stock_id").references(() => shopStock.id, {
      onDelete: "restrict",
    }),
    quantity: integer("quantity").notNull(),
    unitRefundPriceUgx: numeric("unit_refund_price_ugx", {
      precision: 15,
      scale: 2,
    }).notNull(),
    unitCostUgx: numeric("unit_cost_ugx", { precision: 15, scale: 2 }).notNull(),
    totalRefundUgx: numeric("total_refund_ugx", {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Disambiguated from supply_route_lines (`idx_srl_*`) by using `shrl`.
  (table) => [
    index("idx_shrl_return").on(table.shopReturnId),
    index("idx_shrl_item").on(table.itemId),
  ],
)

// ============== Shop → Store returns ==============

export const storeReturns = pgTable(
  "store_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    originalTransferId: uuid("original_transfer_id").references(
      () => storeTransfers.id,
      { onDelete: "set null" },
    ),
    returnDate: timestamp("return_date", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    status: storeReturnStatusEnum("status").notNull().default("dispatched"),
    dispatchedBy: text("dispatched_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    receivedBy: text("received_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    approvedBy: text("approved_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    documentNumber: text("document_number").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_storeret_shop").on(table.shopId),
    index("idx_storeret_store").on(table.storeId),
    index("idx_storeret_status").on(table.status),
  ],
)

export const storeReturnLines = pgTable(
  "store_return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeReturnId: uuid("store_return_id")
      .notNull()
      .references(() => storeReturns.id, { onDelete: "cascade" }),
    // Plan 2b: item identity is denormalized on the line, variant is
    // optional, lot breakdown lives in store_return_line_allocations.
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    shopStockId: uuid("shop_stock_id").references(() => shopStock.id, {
      onDelete: "restrict",
    }),
    quantityDispatched: integer("quantity_dispatched").notNull(),
    quantityReceived: integer("quantity_received"),
    unitTransferPriceUgx: numeric("unit_transfer_price_ugx", {
      precision: 15,
      scale: 2,
    }).notNull(),
    unitCostUgx: numeric("unit_cost_ugx", {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_storerl_return").on(table.storeReturnId),
    index("idx_storerl_item").on(table.itemId),
  ],
)

export const shopReturnRelations = relations(shopReturns, ({ one, many }) => ({
  shop: one(shops, { fields: [shopReturns.shopId], references: [shops.id] }),
  originalSale: one(shopSales, {
    fields: [shopReturns.originalSaleId],
    references: [shopSales.id],
  }),
  customer: one(customers, {
    fields: [shopReturns.customerId],
    references: [customers.id],
  }),
  // Relation key `items` retained as a stable JS API (see supply-routes.ts).
  // Underlying table is now `shop_return_lines` (#8).
  items: many(shopReturnLines),
}))

export const shopReturnLineRelations = relations(shopReturnLines, ({ one, many }) => ({
  shopReturn: one(shopReturns, {
    fields: [shopReturnLines.shopReturnId],
    references: [shopReturns.id],
  }),
  item: one(items, {
    fields: [shopReturnLines.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [shopReturnLines.variantId],
    references: [variants.id],
  }),
  shopStockItem: one(shopStock, {
    fields: [shopReturnLines.shopStockId],
    references: [shopStock.id],
  }),
  allocations: many(shopReturnLineAllocations),
}))

export const shopReturnLineAllocations = pgTable(
  "shop_return_line_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopReturnLineId: uuid("shop_return_line_id")
      .notNull()
      .references(() => shopReturnLines.id, { onDelete: "cascade" }),
    shopStockId: uuid("shop_stock_id")
      .notNull()
      .references(() => shopStock.id, { onDelete: "restrict" }),
    supplyRouteLineId: uuid("supply_route_line_id").references(
      () => supplyRouteLines.id,
      { onDelete: "set null" },
    ),
    quantity: integer("quantity").notNull(),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_shrla_line").on(table.shopReturnLineId),
    index("idx_shrla_stock").on(table.shopStockId),
    index("idx_shrla_supply_line").on(table.supplyRouteLineId),
  ],
)

export const shopReturnLineAllocationRelations = relations(
  shopReturnLineAllocations,
  ({ one }) => ({
    returnLine: one(shopReturnLines, {
      fields: [shopReturnLineAllocations.shopReturnLineId],
      references: [shopReturnLines.id],
    }),
    shopStockItem: one(shopStock, {
      fields: [shopReturnLineAllocations.shopStockId],
      references: [shopStock.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [shopReturnLineAllocations.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
  }),
)

export const storeReturnRelations = relations(storeReturns, ({ one, many }) => ({
  shop: one(shops, { fields: [storeReturns.shopId], references: [shops.id] }),
  store: one(stores, { fields: [storeReturns.storeId], references: [stores.id] }),
  originalTransfer: one(storeTransfers, {
    fields: [storeReturns.originalTransferId],
    references: [storeTransfers.id],
  }),
  // Relation key `items` retained as a stable JS API (see supply-routes.ts).
  // Underlying table is now `store_return_lines` (#8).
  items: many(storeReturnLines),
}))

export const storeReturnLineRelations = relations(storeReturnLines, ({ one, many }) => ({
  storeReturn: one(storeReturns, {
    fields: [storeReturnLines.storeReturnId],
    references: [storeReturns.id],
  }),
  item: one(items, {
    fields: [storeReturnLines.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [storeReturnLines.variantId],
    references: [variants.id],
  }),
  shopStock: one(shopStock, {
    fields: [storeReturnLines.shopStockId],
    references: [shopStock.id],
  }),
  allocations: many(storeReturnLineAllocations),
}))

export const storeReturnLineAllocations = pgTable(
  "store_return_line_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeReturnLineId: uuid("store_return_line_id")
      .notNull()
      .references(() => storeReturnLines.id, { onDelete: "cascade" }),
    shopStockId: uuid("shop_stock_id")
      .notNull()
      .references(() => shopStock.id, { onDelete: "restrict" }),
    supplyRouteLineId: uuid("supply_route_line_id").references(
      () => supplyRouteLines.id,
      { onDelete: "set null" },
    ),
    quantity: integer("quantity").notNull(),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_storla_line").on(table.storeReturnLineId),
    index("idx_storla_stock").on(table.shopStockId),
    index("idx_storla_supply_line").on(table.supplyRouteLineId),
  ],
)

export const storeReturnLineAllocationRelations = relations(
  storeReturnLineAllocations,
  ({ one }) => ({
    returnLine: one(storeReturnLines, {
      fields: [storeReturnLineAllocations.storeReturnLineId],
      references: [storeReturnLines.id],
    }),
    shopStockItem: one(shopStock, {
      fields: [storeReturnLineAllocations.shopStockId],
      references: [shopStock.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [storeReturnLineAllocations.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
  }),
)
