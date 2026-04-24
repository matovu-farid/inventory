import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"

export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location"),
  managerId: text("manager_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const shopStock = pgTable(
  "shop_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    articleNumber: text("article_number"),
    storeTransferItemId: uuid("store_transfer_item_id").notNull(),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    minimumSellPriceUgx: numeric("minimum_sell_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_shst_shop").on(table.shopId),
    index("idx_shst_transfer_item").on(table.storeTransferItemId),
  ],
)

// Relations
export const shopRelations = relations(shops, ({ one, many }) => ({
  manager: one(user, { fields: [shops.managerId], references: [user.id] }),
  stock: many(shopStock),
}))

export const shopStockRelations = relations(shopStock, ({ one }) => ({
  shop: one(shops, {
    fields: [shopStock.shopId],
    references: [shops.id],
  }),
}))
