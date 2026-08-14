import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { items } from './items'

export const itemImages = pgTable(
  'item_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    imageS3Key: text('image_s3_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    suggestedColorName: text('suggested_color_name'),
    suggestedColorHex: text('suggested_color_hex'),
    sampledHex: text('sampled_hex'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('item_images_s3_key_unique').on(table.imageS3Key),
    index('item_images_item_order_idx').on(table.itemId, table.sortOrder),
  ],
)

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, {
    fields: [itemImages.itemId],
    references: [items.id],
  }),
}))
