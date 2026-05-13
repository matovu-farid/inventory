import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { productColors } from "./products"

export const pictureUploadTokens = pgTable(
  "picture_upload_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => productColors.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    uploadedKey: text("uploaded_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("picture_upload_tokens_color_consumed_idx").on(
      t.productColorId,
      t.consumedAt,
    ),
  ],
)

export const pictureUploadTokensRelations = relations(
  pictureUploadTokens,
  ({ one }) => ({
    productColor: one(productColors, {
      fields: [pictureUploadTokens.productColorId],
      references: [productColors.id],
    }),
  }),
)
