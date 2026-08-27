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
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { shops, shopStock } from './shops'
import { bankAccounts } from './bank-accounts'
import { supplyRouteLines } from './supply-routes'
import { items } from './items'
import { variants } from './variants'

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank',
  'credit',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'settled',
  'open',
  'partially_paid',
  'written_off',
])

export const shopSales = pgTable(
  'shop_sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'restrict' }),
    saleDate: timestamp('sale_date', { withTimezone: true }).notNull(),
    soldBy: text('sold_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'restrict',
    }),
    customerId: uuid('customer_id'),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('settled'),
    outstandingBalance: numeric('outstanding_balance', {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default('0'),
    approvedBy: text('approved_by').references(() => user.id, {
      onDelete: 'restrict',
    }),
    documentNumber: text('document_number'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_sale_shop').on(table.shopId),
    index('idx_sale_date').on(table.saleDate),
    index('idx_sale_soldby').on(table.soldBy),
    index('idx_sale_customer').on(table.customerId),
    index('idx_sale_status').on(table.paymentStatus),
  ],
)

export const shopSaleLines = pgTable(
  'shop_sale_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopSaleId: uuid('shop_sale_id')
      .notNull()
      .references(() => shopSales.id, { onDelete: 'cascade' }),
    // Item-level identity (Plan 2b). Lot breakdown lives in
    // shop_sale_line_allocations — one row per source shop_stock lot
    // drained by this line.
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    // Nullable now — item-level sales reference one or many lots via
    // allocations. Retained for backwards compat with audit/article-number
    // resolvers that still walk this column (Plan 2c will sweep).
    shopStockId: uuid('shop_stock_id').references(() => shopStock.id, {
      onDelete: 'restrict',
    }),
    quantity: integer('quantity').notNull(),
    unitPriceUgx: numeric('unit_price_ugx', {
      precision: 15,
      scale: 2,
    }).notNull(),
    minimumPriceUgx: numeric('minimum_price_ugx', {
      precision: 15,
      scale: 2,
    }).notNull(),
    isBelowMinimum: boolean('is_below_minimum').notNull().default(false),
    belowMinimumReason: text('below_minimum_reason'),
    totalPriceUgx: numeric('total_price_ugx', {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_ssl_sale').on(table.shopSaleId),
    index('idx_ssl_item').on(table.itemId),
  ],
)

// Relations
export const shopSaleRelations = relations(shopSales, ({ one, many }) => ({
  shop: one(shops, { fields: [shopSales.shopId], references: [shops.id] }),
  soldByUser: one(user, {
    fields: [shopSales.soldBy],
    references: [user.id],
    relationName: 'soldBy',
  }),
  approvedByUser: one(user, {
    fields: [shopSales.approvedBy],
    references: [user.id],
    relationName: 'approvedBy',
  }),
  bankAccount: one(bankAccounts, {
    fields: [shopSales.bankAccountId],
    references: [bankAccounts.id],
  }),
  // Relation key `items` retained as a stable JS API (see comment in
  // supply-routes.ts on the same pattern). Underlying table is now
  // `shop_sale_lines` (#8).
  items: many(shopSaleLines),
}))

export const shopSaleLineRelations = relations(
  shopSaleLines,
  ({ one, many }) => ({
    shopSale: one(shopSales, {
      fields: [shopSaleLines.shopSaleId],
      references: [shopSales.id],
    }),
    item: one(items, {
      fields: [shopSaleLines.itemId],
      references: [items.id],
    }),
    variant: one(variants, {
      fields: [shopSaleLines.variantId],
      references: [variants.id],
    }),
    allocations: many(shopSaleLineAllocations),
  }),
)

export const shopSaleLineAllocations = pgTable(
  'shop_sale_line_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopSaleLineId: uuid('shop_sale_line_id')
      .notNull()
      .references(() => shopSaleLines.id, { onDelete: 'cascade' }),
    shopStockId: uuid('shop_stock_id')
      .notNull()
      .references(() => shopStock.id, { onDelete: 'restrict' }),
    supplyRouteLineId: uuid('supply_route_line_id').references(
      () => supplyRouteLines.id,
      { onDelete: 'set null' },
    ),
    quantity: integer('quantity').notNull(),
    costPerUnitUgx: numeric('cost_per_unit_ugx', {
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
  },
  (table) => [
    index('idx_ssla_line').on(table.shopSaleLineId),
    index('idx_ssla_stock').on(table.shopStockId),
    index('idx_ssla_supply_line').on(table.supplyRouteLineId),
  ],
)

export const shopSaleLineAllocationRelations = relations(
  shopSaleLineAllocations,
  ({ one }) => ({
    saleLine: one(shopSaleLines, {
      fields: [shopSaleLineAllocations.shopSaleLineId],
      references: [shopSaleLines.id],
    }),
    shopStockItem: one(shopStock, {
      fields: [shopSaleLineAllocations.shopStockId],
      references: [shopStock.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [shopSaleLineAllocations.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
  }),
)
