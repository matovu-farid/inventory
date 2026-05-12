import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleNumber: text("article_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sizes: text("sizes").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_products_article").on(table.articleNumber)],
)

export const productColors = pgTable(
  "product_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    imageS3Key: text("image_s3_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_pc_product").on(table.productId),
    index("idx_pc_unique").on(table.productId, table.colorName),
  ],
)

export const productRelations = relations(products, ({ many }) => ({
  colors: many(productColors),
}))

export const productColorRelations = relations(productColors, ({ one }) => ({
  product: one(products, {
    fields: [productColors.productId],
    references: [products.id],
  }),
}))
