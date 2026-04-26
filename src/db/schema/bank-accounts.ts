import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { transactions } from "./transactions"
import { shopSales } from "./sales"
import { locationExpenses } from "./expenses"

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// Relations
export const bankAccountRelations = relations(bankAccounts, ({ many }) => ({
  transactions: many(transactions),
  shopSales: many(shopSales),
  locationExpenses: many(locationExpenses),
}))
