import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { supplyRouteSuppliers, supplyRouteItems } from "./supply-routes"

export const supplierTypeEnum = pgEnum("supplier_type", ["local", "international"])

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: supplierTypeEnum("type").notNull(),
  country: text("country"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// Relations
export const supplierRelations = relations(suppliers, ({ many }) => ({
  supplyRouteSuppliers: many(supplyRouteSuppliers),
  supplyRouteItems: many(supplyRouteItems),
}))
