import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  numeric,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { suppliers } from "./suppliers"

export const supplyRouteStatusEnum = pgEnum("supply_route_status", [
  "planning",
  "in_transit",
  "received",
])

export const expenseCategoryEnum = pgEnum("expense_category", [
  "freight",
  "shipping",
  "customs",
  "ticket",
  "transportation",
  "insurance",
  "rent",
  "salary",
  "tax",
  "miscellaneous",
])

export const supplyRoutes = pgTable(
  "supply_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: supplyRouteStatusEnum("status").notNull().default("planning"),
    departureDate: date("departure_date"),
    returnDate: date("return_date"),
    budgetUsd: numeric("budget_usd", { precision: 15, scale: 2 }),
    rateUgxPerUsd: numeric("rate_ugx_per_usd", { precision: 10, scale: 2 }),
    rateRmbPerUsd: numeric("rate_rmb_per_usd", { precision: 10, scale: 6 }),
    notes: text("notes"),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_route_external_ref").on(table.externalRef)],
)

export const supplyRouteSuppliers = pgTable(
  "supply_route_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplyRouteId: uuid("supply_route_id")
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_srs_route").on(table.supplyRouteId),
    index("idx_srs_supplier").on(table.supplierId),
  ],
)

export const supplyRouteItems = pgTable(
  "supply_route_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplyRouteId: uuid("supply_route_id")
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    articleNumber: text("article_number"),
    quantity: integer("quantity").notNull(),
    unitPriceForeign: numeric("unit_price_foreign", { precision: 15, scale: 2 }).notNull(),
    foreignCurrency: text("foreign_currency").notNull().default("RMB"),
    exchangeRateForeignToUsd: numeric("exchange_rate_foreign_to_usd", {
      precision: 10,
      scale: 6,
    }),
    exchangeRateUsdToUgx: numeric("exchange_rate_usd_to_ugx", {
      precision: 10,
      scale: 2,
    }),
    totalAmountForeign: numeric("total_amount_foreign", { precision: 15, scale: 2 }).notNull(),
    totalAmountUsd: numeric("total_amount_usd", { precision: 15, scale: 2 }),
    totalCostUgx: numeric("total_cost_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sri_route").on(table.supplyRouteId),
    index("idx_sri_supplier").on(table.supplierId),
  ],
)

export const supplyRouteExpenses = pgTable(
  "supply_route_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplyRouteId: uuid("supply_route_id")
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: "cascade" }),
    category: expenseCategoryEnum("category").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    currency: text("currency").default("UGX"),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_sre_route").on(table.supplyRouteId)],
)

// Relations
export const supplyRouteRelations = relations(supplyRoutes, ({ many }) => ({
  suppliers: many(supplyRouteSuppliers),
  items: many(supplyRouteItems),
  expenses: many(supplyRouteExpenses),
}))

export const supplyRouteSupplierRelations = relations(supplyRouteSuppliers, ({ one }) => ({
  supplyRoute: one(supplyRoutes, {
    fields: [supplyRouteSuppliers.supplyRouteId],
    references: [supplyRoutes.id],
  }),
  supplier: one(suppliers, {
    fields: [supplyRouteSuppliers.supplierId],
    references: [suppliers.id],
  }),
}))

export const supplyRouteItemRelations = relations(supplyRouteItems, ({ one }) => ({
  supplyRoute: one(supplyRoutes, {
    fields: [supplyRouteItems.supplyRouteId],
    references: [supplyRoutes.id],
  }),
  supplier: one(suppliers, {
    fields: [supplyRouteItems.supplierId],
    references: [suppliers.id],
  }),
}))

export const supplyRouteExpenseRelations = relations(supplyRouteExpenses, ({ one }) => ({
  supplyRoute: one(supplyRoutes, {
    fields: [supplyRouteExpenses.supplyRouteId],
    references: [supplyRoutes.id],
  }),
}))
