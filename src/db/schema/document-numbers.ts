import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core"

export const documentNumbers = pgTable(
  "document_numbers",
  {
    prefix: text("prefix").notNull(),
    year: integer("year").notNull(),
    next: integer("next").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.prefix, table.year] })],
)
