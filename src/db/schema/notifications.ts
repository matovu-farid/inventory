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
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import { user } from "./auth"
import { shops } from "./shops"
import { stores } from "./store"
import { itemColors } from "./items"
import { supplyRouteItems } from "./supply-routes"

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_notif_user").on(table.userId, table.readAt),
    index("idx_notif_kind").on(table.kind),
  ],
)

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const thresholdModeEnum = pgEnum("threshold_mode", ["percent", "units"])
export const thresholdScopeEnum = pgEnum("threshold_scope", ["store", "shop"])
export const lowStockAlertStatusEnum = pgEnum("low_stock_alert_status", [
  "open",
  "resolved",
])
export const restockRequisitionStatusEnum = pgEnum(
  "restock_requisition_status",
  ["open", "planned", "fulfilled", "dismissed"],
)

export const notificationThresholds = pgTable(
  "notification_thresholds",
  {
    id: text("id").primaryKey().default("global"),
    storeMode: thresholdModeEnum("store_mode").notNull().default("percent"),
    storeValue: numeric("store_value", { precision: 10, scale: 2 })
      .notNull()
      .default("30"),
    shopMode: thresholdModeEnum("shop_mode").notNull().default("percent"),
    shopValue: numeric("shop_value", { precision: 10, scale: 2 })
      .notNull()
      .default("15"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("ck_thresholds_singleton", sql`${table.id} = 'global'`)],
)

export const notificationThresholdOverrides = pgTable(
  "notification_threshold_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: thresholdScopeEnum("scope").notNull(),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => itemColors.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    mode: thresholdModeEnum("mode").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("uq_thr_override")
      .on(table.scope, table.productColorId, table.size, table.shopId)
      .nullsNotDistinct(),
    check(
      "ck_override_scope_shop",
      sql`${table.scope} = 'shop' OR ${table.shopId} IS NULL`,
    ),
    index("idx_thr_override_variant").on(table.productColorId, table.size),
  ],
)

export const lowStockAlerts = pgTable(
  "low_stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: thresholdScopeEnum("scope").notNull(),
    // Polymorphic: stores.id when scope='store', shops.id when scope='shop'. No FK by design.
    locationId: uuid("location_id").notNull(),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => itemColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    status: lowStockAlertStatusEnum("status").notNull().default("open"),
    baselineQuantity: integer("baseline_quantity").notNull(),
    thresholdSnapshot: jsonb("threshold_snapshot")
      .$type<{ mode: "percent" | "units"; value: number }>()
      .notNull(),
    quantityAtOpen: integer("quantity_at_open").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_lsa_status_scope").on(table.status, table.scope),
    index("idx_lsa_location").on(table.locationId),
    uniqueIndex("uq_lsa_open")
      .on(table.scope, table.locationId, table.productColorId, table.size)
      .where(sql`status = 'open'`),
  ],
)

export const restockRequisitions = pgTable(
  "restock_requisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => itemColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    suggestedQuantity: integer("suggested_quantity").notNull(),
    baselineQuantity: integer("baseline_quantity").notNull(),
    quantityAtOpen: integer("quantity_at_open").notNull(),
    status: restockRequisitionStatusEnum("status").notNull().default("open"),
    supplyRouteItemId: uuid("supply_route_item_id").references(
      () => supplyRouteItems.id,
      { onDelete: "set null" },
    ),
    dismissedReason: text("dismissed_reason"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_req_store_status").on(table.storeId, table.status),
    uniqueIndex("uq_req_open")
      .on(table.storeId, table.productColorId, table.size)
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
    productColor: one(itemColors, {
      fields: [notificationThresholdOverrides.productColorId],
      references: [itemColors.id],
    }),
    shop: one(shops, {
      fields: [notificationThresholdOverrides.shopId],
      references: [shops.id],
    }),
  }),
)

export const lowStockAlertsRelations = relations(lowStockAlerts, ({ one }) => ({
  productColor: one(itemColors, {
    fields: [lowStockAlerts.productColorId],
    references: [itemColors.id],
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
    productColor: one(itemColors, {
      fields: [restockRequisitions.productColorId],
      references: [itemColors.id],
    }),
    supplyRouteItem: one(supplyRouteItems, {
      fields: [restockRequisitions.supplyRouteItemId],
      references: [supplyRouteItems.id],
    }),
  }),
)
