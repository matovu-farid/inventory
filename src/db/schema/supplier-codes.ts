import { relations } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { suppliers } from './suppliers'

export const supplierCodes = pgTable(
  'supplier_codes',
  {
    supplierId: uuid('supplier_id')
      .primaryKey()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex('uq_supplier_codes_code').on(table.code)],
)

export const supplierCodeRelations = relations(supplierCodes, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierCodes.supplierId],
    references: [suppliers.id],
  }),
}))
