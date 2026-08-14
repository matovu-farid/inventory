import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { items, itemColors } from './items'
import { pictureUploads } from './picture-uploads'

export const pictureUploadTokens = pgTable(
  'picture_upload_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    itemColorId: uuid('item_color_id').references(() => itemColors.id, {
      onDelete: 'cascade',
    }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Kept in the schema while older rows are migrated; new session code uses
    // completedAt and pictureUploads instead.
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    uploadedKey: text('uploaded_key'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('picture_upload_tokens_item_completed_idx').on(
      t.itemId,
      t.completedAt,
    ),
    index('picture_upload_tokens_color_completed_idx').on(
      t.itemColorId,
      t.completedAt,
    ),
  ],
)

export const pictureUploadTokensRelations = relations(
  pictureUploadTokens,
  ({ one, many }) => ({
    item: one(items, {
      fields: [pictureUploadTokens.itemId],
      references: [items.id],
    }),
    itemColor: one(itemColors, {
      fields: [pictureUploadTokens.itemColorId],
      references: [itemColors.id],
    }),
    uploads: many(pictureUploads),
  }),
)
