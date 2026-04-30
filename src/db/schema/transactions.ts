import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { bankAccounts } from "./bank-accounts"
import { locationTypeEnum } from "./expenses"

export const categoryTypeEnum = pgEnum("category_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
])

export const transactionTypeEnum = pgEnum("transaction_type", ["debit", "credit"])

export const depositLocationEnum = pgEnum("deposit_location", ["cash", "bank"])

export const transactionCategories = pgTable(
  "transaction_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: categoryTypeEnum("type").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_categories_name_type").on(table.name, table.type),
    index("idx_tc_name").on(table.name),
  ],
)

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: transactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => transactionCategories.id, { onDelete: "restrict" }),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    journalGroupId: uuid("journal_group_id").notNull(),
    reversesJournalGroupId: uuid("reverses_journal_group_id"),
    reversedByJournalGroupId: uuid("reversed_by_journal_group_id"),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
    description: text("description"),
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: uuid("location_id").notNull(),
    depositLocation: depositLocationEnum("deposit_location"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_txn_date").on(table.transactionDate),
    index("idx_txn_category").on(table.categoryId),
    index("idx_txn_journal_group").on(table.journalGroupId),
    index("idx_txn_reference").on(table.referenceType, table.referenceId),
    index("idx_txn_location").on(table.locationType, table.locationId),
  ],
)

// Relations
export const transactionCategoryRelations = relations(transactionCategories, ({ many }) => ({
  transactions: many(transactions),
}))

export const transactionRelations = relations(transactions, ({ one }) => ({
  category: one(transactionCategories, {
    fields: [transactions.categoryId],
    references: [transactionCategories.id],
  }),
  recordedByUser: one(user, {
    fields: [transactions.recordedBy],
    references: [user.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [transactions.bankAccountId],
    references: [bankAccounts.id],
  }),
}))
