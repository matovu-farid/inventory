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
import { itemColors } from './items'

export const itemColorImages = pgTable(
  'item_color_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemColorId: uuid('item_color_id')
      .notNull()
      .references(() => itemColors.id, { onDelete: 'cascade' }),
    imageS3Key: text('image_s3_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('item_color_images_s3_key_unique').on(table.imageS3Key),
    index('item_color_images_color_order_idx').on(
      table.itemColorId,
      table.sortOrder,
    ),
  ],
)

export const itemColorImagesRelations = relations(
  itemColorImages,
  ({ one }) => ({
    itemColor: one(itemColors, {
      fields: [itemColorImages.itemColorId],
      references: [itemColors.id],
    }),
  }),
)
