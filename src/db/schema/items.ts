import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { itemCategories } from "./item-categories"

/**
 * Catalog: items (renamed from `products` in issue #3) and item_colors
 * (renamed from `product_colors`). The TS symbols here are the source of
 * truth for the renamed tables — `drizzle-kit push` syncs the DB schema
 * to this file, and `drizzle/0011_items_rename_and_category.sql` is the
 * human-readable record of the rename DDL applied at the same time.
 *
 * Out of scope for this rename (deferred to #4 / #5): the DB column names
 * `product_id` / `product_color_id` on stock, sales, transfer, and
 * notification tables stay as-is — only the FK ref-target symbols on the
 * right-hand side of `references(() => items.id, ...)` change here.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleNumber: text("article_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sizes: text("sizes").array().notNull().default([]),
    /**
     * Catalog grouping for this item. NOT NULL — every item belongs to
     * exactly one category. Existing rows are backfilled to the seeded
     * "Uncategorized" category (see drizzle/0009_item_categories.sql).
     * Restrict on delete so categories with items can't be silently
     * orphaned.
     */
    itemCategoryId: uuid("item_category_id")
      .notNull()
      .references(() => itemCategories.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_items_article").on(table.articleNumber),
    index("idx_items_category").on(table.itemCategoryId),
  ],
)

export const itemColors = pgTable(
  "item_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    imageS3Key: text("image_s3_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_ic_item").on(table.itemId),
    index("idx_ic_unique").on(table.itemId, table.colorName),
  ],
)

export const itemRelations = relations(items, ({ one, many }) => ({
  colors: many(itemColors),
  category: one(itemCategories, {
    fields: [items.itemCategoryId],
    references: [itemCategories.id],
  }),
}))

export const itemColorRelations = relations(itemColors, ({ one }) => ({
  // The relation key stays `product` for one more release so the UI / API
  // shape consumers (route loaders, react components) don't have to churn
  // in lockstep with this DB rename. The rename to `item` is tracked
  // separately and lands once consumers migrate.
  product: one(items, {
    fields: [itemColors.itemId],
    references: [items.id],
  }),
}))
