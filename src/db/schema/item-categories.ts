import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

/**
 * Item categories — groupings for products in the catalog (e.g. "Shoes",
 * "Bags", "Accessories"). Distinct from `transaction_categories` which
 * lives in the accounting module and groups journal entries by P/L line.
 *
 * `items.item_category_id` (the FK linking items to this table) is added
 * in a later issue; this migration only introduces the table itself and
 * the seed row so the admin can start curating the list.
 */
export const itemCategories = pgTable(
  "item_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_ic_name").on(table.name)],
)

// Relations are declared here so a later migration that adds
// `items.item_category_id` only needs to wire the inverse side without
// having to retro-fit this file.
export const itemCategoryRelations = relations(itemCategories, () => ({}))
