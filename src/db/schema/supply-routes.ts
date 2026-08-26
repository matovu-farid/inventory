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
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { suppliers } from './suppliers'
import { itemColors, items } from './items'

export const supplyRouteStatusEnum = pgEnum('supply_route_status', [
  'open',
  'received',
])

export const expenseCategoryEnum = pgEnum('expense_category', [
  'freight',
  'shipping',
  'customs',
  'ticket',
  'transportation',
  'insurance',
  'rent',
  'salary',
  'tax',
  'miscellaneous',
])

export const supplyRoutes = pgTable(
  'supply_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: supplyRouteStatusEnum('status').notNull().default('open'),
    departureDate: date('departure_date'),
    returnDate: date('return_date'),
    budgetUsd: numeric('budget_usd', { precision: 15, scale: 2 }),
    rateUgxPerUsd: numeric('rate_ugx_per_usd', { precision: 10, scale: 2 }),
    rateRmbPerUsd: numeric('rate_rmb_per_usd', { precision: 10, scale: 6 }),
    notes: text('notes'),
    externalRef: text('external_ref'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('idx_route_external_ref').on(table.externalRef)],
)

export const supplyRouteReceipts = pgTable(
  'supply_route_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplyRouteId: uuid('supply_route_id')
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    sourceEntryId: uuid('source_entry_id'),
    receiptDate: date('receipt_date'),
    reference: text('reference'),
    notes: text('notes'),
    foreignCurrency: text('foreign_currency').notNull().default('RMB'),
    exchangeRateForeignToUsd: numeric('exchange_rate_foreign_to_usd', {
      precision: 10,
      scale: 6,
    }),
    exchangeRateUsdToUgx: numeric('exchange_rate_usd_to_ugx', {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_srr_route').on(table.supplyRouteId),
    index('idx_srr_supplier').on(table.supplierId),
    uniqueIndex('uq_srr_route_supplier_source').on(
      table.supplyRouteId,
      table.supplierId,
      table.sourceEntryId,
    ),
  ],
)

export const supplyRouteLines = pgTable(
  'supply_route_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id').defaultRandom().notNull(),
    supplyRouteId: uuid('supply_route_id')
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: 'cascade' }),
    receiptId: uuid('receipt_id').references(() => supplyRouteReceipts.id, {
      onDelete: 'cascade',
    }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    // itemId is set on all newly created rows. It is nullable so existing
    // rows (which only had a color) can be migrated without a backfill;
    // for those rows the item is reachable through itemColor.
    //
    // Renamed from `product_id` for #6 (the catalog rename landed `products
    // → items` in #3 but supply_route_items kept the old column name until
    // then). The table itself was renamed from `supply_route_items` to
    // `supply_route_lines` in Phase 2 (#8).
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'restrict',
    }),
    // colorId and size are nullable to support three procurement modes:
    //   1. aggregate     — colorId NULL, size NULL
    //   2. color-only    — colorId set,  size NULL
    //   3. color + size  — colorId set,  size set
    // Aggregate/color-only rows must be "split" into full variants by an admin
    // before goods can be received against them. Receiving resolves a full
    // line to a variant_id (creating the variant if it doesn't exist yet).
    //
    // Renamed from `product_color_id` for #6.
    colorId: uuid('color_id').references(() => itemColors.id, {
      onDelete: 'restrict',
    }),
    size: text('size'),
    supplierNameSnapshot: text('supplier_name_snapshot'),
    articleNumberSnapshot: text('article_number_snapshot'),
    itemNameSnapshot: text('item_name_snapshot'),
    colorNameSnapshot: text('color_name_snapshot'),
    designSnapshot: text('design_snapshot'),
    colorTextSnapshot: text('color_text_snapshot'),
    colorHexSnapshot: text('color_hex_snapshot'),
    sizeTextSnapshot: text('size_text_snapshot'),
    quantity: integer('quantity').notNull(),
    unitPriceForeign: numeric('unit_price_foreign', {
      precision: 15,
      scale: 2,
    }).notNull(),
    foreignCurrency: text('foreign_currency').notNull().default('RMB'),
    exchangeRateForeignToUsd: numeric('exchange_rate_foreign_to_usd', {
      precision: 10,
      scale: 6,
    }),
    exchangeRateUsdToUgx: numeric('exchange_rate_usd_to_ugx', {
      precision: 10,
      scale: 2,
    }),
    totalAmountForeign: numeric('total_amount_foreign', {
      precision: 15,
      scale: 2,
    }).notNull(),
    totalAmountUsd: numeric('total_amount_usd', { precision: 15, scale: 2 }),
    totalCostUgx: numeric('total_cost_ugx', {
      precision: 15,
      scale: 2,
    }).notNull(),
    minimumSellPriceUgx: numeric('minimum_sell_price_ugx', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_srl_entry').on(table.entryId),
    index('idx_srl_route').on(table.supplyRouteId),
    index('idx_srl_receipt').on(table.receiptId),
    index('idx_srl_supplier').on(table.supplierId),
    index('idx_srl_color').on(table.colorId),
    index('idx_srl_item').on(table.itemId),
    uniqueIndex('uq_srl_entry_variant')
      .on(
        table.supplyRouteId,
        table.entryId,
        table.supplierId,
        sql`coalesce(${table.colorId}::text, '')`,
        sql`coalesce(${table.size}, '')`,
      )
      .where(sql`${table.itemId} IS NOT NULL`),
  ],
)

export const supplyRouteExpenses = pgTable(
  'supply_route_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplyRouteId: uuid('supply_route_id')
      .notNull()
      .references(() => supplyRoutes.id, { onDelete: 'cascade' }),
    category: expenseCategoryEnum('category').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('UGX'),
    exchangeRate: numeric('exchange_rate', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('idx_sre_route').on(table.supplyRouteId)],
)

// Relations
export const supplyRouteRelations = relations(supplyRoutes, ({ many }) => ({
  // Relation key `items` retained as a stable JS API (`with: { items: true }`
  // call sites unchanged). The underlying table is now `supply_route_lines`
  // (#8). Keeping the relation key minimises diff scope; the spec's
  // "relation names renamed in lockstep" is honoured by renaming the
  // `*Relations` export const + `idx_srl_*` index names + FK column names.
  items: many(supplyRouteLines),
  receipts: many(supplyRouteReceipts),
  expenses: many(supplyRouteExpenses),
}))

export const supplyRouteLineRelations = relations(
  supplyRouteLines,
  ({ one }) => ({
    supplyRoute: one(supplyRoutes, {
      fields: [supplyRouteLines.supplyRouteId],
      references: [supplyRoutes.id],
    }),
    receipt: one(supplyRouteReceipts, {
      fields: [supplyRouteLines.receiptId],
      references: [supplyRouteReceipts.id],
    }),
    supplier: one(suppliers, {
      fields: [supplyRouteLines.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [supplyRouteLines.itemId],
      references: [items.id],
    }),
    itemColor: one(itemColors, {
      fields: [supplyRouteLines.colorId],
      references: [itemColors.id],
    }),
  }),
)

export const supplyRouteReceiptRelations = relations(
  supplyRouteReceipts,
  ({ one, many }) => ({
    supplyRoute: one(supplyRoutes, {
      fields: [supplyRouteReceipts.supplyRouteId],
      references: [supplyRoutes.id],
    }),
    supplier: one(suppliers, {
      fields: [supplyRouteReceipts.supplierId],
      references: [suppliers.id],
    }),
    lines: many(supplyRouteLines),
  }),
)

export const supplyRouteExpenseRelations = relations(
  supplyRouteExpenses,
  ({ one }) => ({
    supplyRoute: one(supplyRoutes, {
      fields: [supplyRouteExpenses.supplyRouteId],
      references: [supplyRoutes.id],
    }),
  }),
)
