import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { locationTypeEnum } from "./expenses"
import { storeStock } from "./store"
import { shopStock } from "./shops"

export const stockTakeStatusEnum = pgEnum("stock_take_status", [
  "in_progress",
  "completed",
  "reconciled",
])

export const stockTakes = pgTable(
  "stock_takes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationType: locationTypeEnum("location_type").notNull(),
    locationId: uuid("location_id").notNull(),
    stockTakeDate: timestamp("stock_take_date", { withTimezone: true }).notNull(),
    status: stockTakeStatusEnum("status").notNull().default("in_progress"),
    conductedBy: text("conducted_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_stk_location").on(table.locationType, table.locationId),
    index("idx_stk_date").on(table.stockTakeDate),
  ],
)

export const stockTakeItems = pgTable(
  "stock_take_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockTakeId: uuid("stock_take_id")
      .notNull()
      .references(() => stockTakes.id, { onDelete: "cascade" }),
    storeStockId: uuid("store_stock_id").references(() => storeStock.id, {
      onDelete: "restrict",
    }),
    shopStockId: uuid("shop_stock_id").references(() => shopStock.id, {
      onDelete: "restrict",
    }),
    productName: text("product_name").notNull(),
    systemQuantity: integer("system_quantity").notNull(),
    physicalQuantity: integer("physical_quantity").notNull(),
    discrepancy: integer("discrepancy").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_stki_take").on(table.stockTakeId)],
)

// Relations
export const stockTakeRelations = relations(stockTakes, ({ one, many }) => ({
  conductedByUser: one(user, {
    fields: [stockTakes.conductedBy],
    references: [user.id],
  }),
  items: many(stockTakeItems),
}))

export const stockTakeItemRelations = relations(stockTakeItems, ({ one }) => ({
  stockTake: one(stockTakes, {
    fields: [stockTakeItems.stockTakeId],
    references: [stockTakes.id],
  }),
  storeStockItem: one(storeStock, {
    fields: [stockTakeItems.storeStockId],
    references: [storeStock.id],
  }),
  shopStockItem: one(shopStock, {
    fields: [stockTakeItems.shopStockId],
    references: [shopStock.id],
  }),
}))
