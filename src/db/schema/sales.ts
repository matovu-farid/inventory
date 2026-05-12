import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { shops, shopStock } from "./shops"
import { bankAccounts } from "./bank-accounts"

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "bank", "credit"])

export const paymentStatusEnum = pgEnum("payment_status", [
  "settled",
  "open",
  "partially_paid",
  "written_off",
])

export const shopSales = pgTable(
  "shop_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    saleDate: timestamp("sale_date", { withTimezone: true }).notNull(),
    soldBy: text("sold_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    customerId: uuid("customer_id"),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("settled"),
    outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "restrict" }),
    documentNumber: text("document_number"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sale_shop").on(table.shopId),
    index("idx_sale_date").on(table.saleDate),
    index("idx_sale_soldby").on(table.soldBy),
    index("idx_sale_customer").on(table.customerId),
    index("idx_sale_status").on(table.paymentStatus),
  ],
)

export const shopSaleItems = pgTable(
  "shop_sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopSaleId: uuid("shop_sale_id")
      .notNull()
      .references(() => shopSales.id, { onDelete: "cascade" }),
    shopStockId: uuid("shop_stock_id")
      .notNull()
      .references(() => shopStock.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceUgx: numeric("unit_price_ugx", { precision: 15, scale: 2 }).notNull(),
    minimumPriceUgx: numeric("minimum_price_ugx", { precision: 15, scale: 2 }).notNull(),
    isBelowMinimum: boolean("is_below_minimum").notNull().default(false),
    belowMinimumReason: text("below_minimum_reason"),
    totalPriceUgx: numeric("total_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_ssi_sale").on(table.shopSaleId)],
)

// Relations
export const shopSaleRelations = relations(shopSales, ({ one, many }) => ({
  shop: one(shops, { fields: [shopSales.shopId], references: [shops.id] }),
  soldByUser: one(user, {
    fields: [shopSales.soldBy],
    references: [user.id],
    relationName: "soldBy",
  }),
  approvedByUser: one(user, {
    fields: [shopSales.approvedBy],
    references: [user.id],
    relationName: "approvedBy",
  }),
  bankAccount: one(bankAccounts, {
    fields: [shopSales.bankAccountId],
    references: [bankAccounts.id],
  }),
  items: many(shopSaleItems),
}))

export const shopSaleItemRelations = relations(shopSaleItems, ({ one }) => ({
  shopSale: one(shopSales, {
    fields: [shopSaleItems.shopSaleId],
    references: [shopSales.id],
  }),
  shopStockItem: one(shopStock, {
    fields: [shopSaleItems.shopStockId],
    references: [shopStock.id],
  }),
}))
