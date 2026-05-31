-- Finish the catalog rename on `picture_upload_tokens`.
--
-- The catalog rename `products → items` and `product_colors → item_colors`
-- landed in #3, and stock / notification / supply-route tables moved to
-- the new vocabulary in #4 / #5 / #6. The only column still using the
-- legacy `product_color_id` spelling lives on `picture_upload_tokens`,
-- which was created via `drizzle-kit push` and never got swept up.
--
-- This migration:
--   product_color_id → item_color_id
--
-- The index `picture_upload_tokens_color_consumed_idx` references the
-- renamed column automatically — its name didn't embed the old column
-- spelling, so no rename is needed. FK preserves across RENAME COLUMN.
--
-- This repo uses `drizzle-kit push`, so `src/db/schema/picture-upload-tokens.ts`
-- is the source of truth; this file is the human-readable record of the
-- DDL drizzle-kit will apply.

BEGIN;

ALTER TABLE "picture_upload_tokens" RENAME COLUMN "product_color_id" TO "item_color_id";

COMMIT;
