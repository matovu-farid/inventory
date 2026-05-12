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

export const shopReturnItems = pgTable(
  "shop_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopReturnId: uuid("shop_return_id")
      .notNull()
      .references(() => shopReturns.id, { onDelete: "cascade" }),
    shopStockId: uuid("shop_stock_id")
      .notNull()
      .references(() => shopStock.id, { onDelete: "restrict" }),
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
  (table) => [index("idx_sri_return").on(table.shopReturnId)],
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

export const storeReturnItems = pgTable(
  "store_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeReturnId: uuid("store_return_id")
      .notNull()
      .references(() => storeReturns.id, { onDelete: "cascade" }),
    shopStockId: uuid("shop_stock_id")
      .notNull()
      .references(() => shopStock.id, { onDelete: "restrict" }),
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
  (table) => [index("idx_storeri_return").on(table.storeReturnId)],
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
  items: many(shopReturnItems),
}))

export const shopReturnItemRelations = relations(shopReturnItems, ({ one }) => ({
  shopReturn: one(shopReturns, {
    fields: [shopReturnItems.shopReturnId],
    references: [shopReturns.id],
  }),
}))

export const storeReturnRelations = relations(storeReturns, ({ one, many }) => ({
  shop: one(shops, { fields: [storeReturns.shopId], references: [shops.id] }),
  store: one(stores, { fields: [storeReturns.storeId], references: [stores.id] }),
  originalTransfer: one(storeTransfers, {
    fields: [storeReturns.originalTransferId],
    references: [storeTransfers.id],
  }),
  items: many(storeReturnItems),
}))

export const storeReturnItemRelations = relations(storeReturnItems, ({ one }) => ({
  storeReturn: one(storeReturns, {
    fields: [storeReturnItems.storeReturnId],
    references: [storeReturns.id],
  }),
}))
