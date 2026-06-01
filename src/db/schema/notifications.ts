import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  index,
  jsonb,
  unique,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'
import { shops } from './shops'
import { stores } from './store'
import { variants } from './variants'
import { items } from './items'
import { supplyRouteLines } from './supply-routes'

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_notif_user').on(table.userId, table.readAt),
    index('idx_notif_kind').on(table.kind),
  ],
)

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const thresholdModeEnum = pgEnum('threshold_mode', ['percent', 'units'])
export const thresholdScopeEnum = pgEnum('threshold_scope', ['store', 'shop'])
export const lowStockAlertStatusEnum = pgEnum('low_stock_alert_status', [
  'open',
  'resolved',
])
export const restockRequisitionStatusEnum = pgEnum(
  'restock_requisition_status',
  ['open', 'planned', 'fulfilled', 'dismissed'],
)

export const notificationThresholds = pgTable(
  'notification_thresholds',
  {
    id: text('id').primaryKey().default('global'),
    storeMode: thresholdModeEnum('store_mode').notNull().default('percent'),
    storeValue: numeric('store_value', { precision: 10, scale: 2 })
      .notNull()
      .default('30'),
    shopMode: thresholdModeEnum('shop_mode').notNull().default('percent'),
    shopValue: numeric('shop_value', { precision: 10, scale: 2 })
      .notNull()
      .default('15'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedBy: text('updated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('ck_thresholds_singleton', sql`${table.id} = 'global'`)],
)

/**
 * Per-variant override of the global low-stock threshold rule.
 *
 * Keyed by `variant_id` (one row per (item, color, size) combination); the
 * older `(product_color_id, size)` composite was swapped out in
 * drizzle/0012_notification_variant_id.sql.
 *
 * The unique constraint treats NULL `shop_id` as a distinct value
 * (`nullsNotDistinct: false` semantics via `NULLS NOT DISTINCT`) so the
 * "all shops" override coexists with per-shop overrides on the same variant.
 */
export const notificationThresholdOverrides = pgTable(
  'notification_threshold_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: thresholdScopeEnum('scope').notNull(),
    // Plan 2c: overrides are item-keyed. variantId retained but nullable
    // for backwards compat with historical rows; new writes set item_id.
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
    mode: thresholdModeEnum('mode').notNull(),
    value: numeric('value', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('uq_thr_override_item')
      .on(table.scope, table.itemId, table.shopId)
      .nullsNotDistinct(),
    check(
      'ck_override_scope_shop',
      sql`${table.scope} = 'shop' OR ${table.shopId} IS NULL`,
    ),
    index('idx_thr_override_item').on(table.itemId),
  ],
)

export const lowStockAlerts = pgTable(
  'low_stock_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: thresholdScopeEnum('scope').notNull(),
    // Polymorphic: stores.id when scope='store', shops.id when scope='shop'. No FK by design.
    locationId: uuid('location_id').notNull(),
    // Plan 2c: alerts are item-keyed. variantId retained nullable for
    // backwards compat with historical rows.
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    status: lowStockAlertStatusEnum('status').notNull().default('open'),
    baselineQuantity: integer('baseline_quantity').notNull(),
    thresholdSnapshot: jsonb('threshold_snapshot')
      .$type<{ mode: 'percent' | 'units'; value: number }>()
      .notNull(),
    quantityAtOpen: integer('quantity_at_open').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('idx_lsa_status_scope').on(table.status, table.scope),
    index('idx_lsa_location').on(table.locationId),
    index('idx_lsa_item').on(table.itemId),
    uniqueIndex('uq_lsa_open_item')
      .on(table.scope, table.locationId, table.itemId)
      .where(sql`status = 'open'`),
  ],
)

export const restockRequisitions = pgTable(
  'restock_requisitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    // Plan 2c: requisitions are item-keyed. variantId retained nullable
    // for backwards compat with historical rows.
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'restrict',
    }),
    suggestedQuantity: integer('suggested_quantity').notNull(),
    baselineQuantity: integer('baseline_quantity').notNull(),
    quantityAtOpen: integer('quantity_at_open').notNull(),
    status: restockRequisitionStatusEnum('status').notNull().default('open'),
    supplyRouteLineId: uuid('supply_route_line_id').references(
      () => supplyRouteLines.id,
      { onDelete: 'set null' },
    ),
    dismissedReason: text('dismissed_reason'),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_req_store_status').on(table.storeId, table.status),
    index('idx_req_item').on(table.itemId),
    uniqueIndex('uq_req_open_item')
      .on(table.storeId, table.itemId)
      .where(sql`status = 'open'`),
  ],
)

export const notificationThresholdsRelations = relations(
  notificationThresholds,
  ({ one }) => ({
    updatedByUser: one(user, {
      fields: [notificationThresholds.updatedBy],
      references: [user.id],
    }),
  }),
)

export const notificationThresholdOverridesRelations = relations(
  notificationThresholdOverrides,
  ({ one }) => ({
    item: one(items, {
      fields: [notificationThresholdOverrides.itemId],
      references: [items.id],
    }),
    variant: one(variants, {
      fields: [notificationThresholdOverrides.variantId],
      references: [variants.id],
    }),
    shop: one(shops, {
      fields: [notificationThresholdOverrides.shopId],
      references: [shops.id],
    }),
  }),
)

export const lowStockAlertsRelations = relations(lowStockAlerts, ({ one }) => ({
  item: one(items, {
    fields: [lowStockAlerts.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [lowStockAlerts.variantId],
    references: [variants.id],
  }),
  notification: one(notifications, {
    fields: [lowStockAlerts.notificationId],
    references: [notifications.id],
  }),
}))

export const restockRequisitionsRelations = relations(
  restockRequisitions,
  ({ one }) => ({
    store: one(stores, {
      fields: [restockRequisitions.storeId],
      references: [stores.id],
    }),
    item: one(items, {
      fields: [restockRequisitions.itemId],
      references: [items.id],
    }),
    variant: one(variants, {
      fields: [restockRequisitions.variantId],
      references: [variants.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [restockRequisitions.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
  }),
)
