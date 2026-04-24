import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { bankAccounts } from "./bank-accounts"
import { paymentMethodEnum } from "./sales"

export const locationTypeEnum = pgEnum("location_type", ["store", "shop"])

export const locationExpenses = pgTable(
  "location_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: uuid("location_id").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_le_location").on(table.locationType, table.locationId),
    index("idx_le_date").on(table.expenseDate),
  ],
)

export const locationExpenseRelations = relations(locationExpenses, ({ one }) => ({
  recordedByUser: one(user, {
    fields: [locationExpenses.recordedBy],
    references: [user.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [locationExpenses.bankAccountId],
    references: [bankAccounts.id],
  }),
}))
