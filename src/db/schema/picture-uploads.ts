import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { items, itemColors } from './items'
import { pictureUploadTokens } from './picture-upload-tokens'

export const pictureUploads = pgTable(
  'picture_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => pictureUploadTokens.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    itemColorId: uuid('item_color_id').references(() => itemColors.id, {
      onDelete: 'cascade',
    }),
    imageS3Key: text('image_s3_key').notNull().unique(),
    suggestedColorName: text('suggested_color_name'),
    suggestedColorHex: text('suggested_color_hex'),
    sampledHex: text('sampled_hex'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    attachedAt: timestamp('attached_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('picture_uploads_token_status_idx').on(
      table.tokenId,
      table.uploadedAt,
      table.attachedAt,
    ),
    index('picture_uploads_item_idx').on(table.itemId),
  ],
)

export const pictureUploadsRelations = relations(pictureUploads, ({ one }) => ({
  token: one(pictureUploadTokens, {
    fields: [pictureUploads.tokenId],
    references: [pictureUploadTokens.id],
  }),
  item: one(items, {
    fields: [pictureUploads.itemId],
    references: [items.id],
  }),
  itemColor: one(itemColors, {
    fields: [pictureUploads.itemColorId],
    references: [itemColors.id],
  }),
}))
