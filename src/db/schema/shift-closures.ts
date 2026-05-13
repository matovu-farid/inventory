import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { shops } from "./shops"

export const shiftClosures = pgTable(
  "shift_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    closureNumber: integer("closure_number").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    closedBy: text("closed_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    openingCashUgx: numeric("opening_cash_ugx", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    declaredCashUgx: numeric("declared_cash_ugx", { precision: 15, scale: 2 }).notNull(),
    expectedCashUgx: numeric("expected_cash_ugx", { precision: 15, scale: 2 }).notNull(),
    varianceUgx: numeric("variance_ugx", { precision: 15, scale: 2 }).notNull(),
    grossSalesUgx: numeric("gross_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    cashSalesUgx: numeric("cash_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    bankSalesUgx: numeric("bank_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    creditSalesUgx: numeric("credit_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    salesCount: integer("sales_count").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("shift_closures_shop_number_idx").on(t.shopId, t.closureNumber),
    index("shift_closures_shop_closed_idx").on(t.shopId, t.closedAt),
  ],
)

export const shiftClosuresRelations = relations(shiftClosures, ({ one }) => ({
  shop: one(shops, { fields: [shiftClosures.shopId], references: [shops.id] }),
  closedByUser: one(user, {
    fields: [shiftClosures.closedBy],
    references: [user.id],
  }),
}))
