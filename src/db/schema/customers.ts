import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { shops } from "./shops"
import { bankAccounts } from "./bank-accounts"
import { user } from "./auth"
import { shopSales } from "./sales"

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_customer_name").on(table.name)],
)

export const customerPayments = pgTable(
  "customer_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(), // cash | bank
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
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
    index("idx_cp_customer").on(table.customerId),
    index("idx_cp_shop").on(table.shopId),
    index("idx_cp_date").on(table.paymentDate),
  ],
)

export const customerPaymentApplications = pgTable(
  "customer_payment_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerPaymentId: uuid("customer_payment_id")
      .notNull()
      .references(() => customerPayments.id, { onDelete: "cascade" }),
    shopSaleId: uuid("shop_sale_id")
      .notNull()
      .references(() => shopSales.id, { onDelete: "restrict" }),
    amountApplied: numeric("amount_applied", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cpa_payment").on(table.customerPaymentId),
    index("idx_cpa_sale").on(table.shopSaleId),
  ],
)

export const customerRelations = relations(customers, ({ many }) => ({
  payments: many(customerPayments),
}))

export const customerPaymentRelations = relations(customerPayments, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerPayments.customerId],
    references: [customers.id],
  }),
  shop: one(shops, { fields: [customerPayments.shopId], references: [shops.id] }),
  applications: many(customerPaymentApplications),
}))

export const customerPaymentApplicationRelations = relations(
  customerPaymentApplications,
  ({ one }) => ({
    payment: one(customerPayments, {
      fields: [customerPaymentApplications.customerPaymentId],
      references: [customerPayments.id],
    }),
    sale: one(shopSales, {
      fields: [customerPaymentApplications.shopSaleId],
      references: [shopSales.id],
    }),
  }),
)
