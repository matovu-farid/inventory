-- Catalog rename + category attachment for issue #3.
--
-- This migration:
--   1. Renames `products` → `items` and `product_colors` → `item_colors`,
--      and renames `item_colors.product_id` → `item_colors.item_id`.
--   2. Renames the related indexes (`idx_products_article` → `idx_items_article`;
--      `idx_pc_product` → `idx_ic_item`; `idx_pc_unique` → `idx_ic_unique`).
--   3. Adds `items.item_category_id uuid` (nullable), backfills every row to
--      the seeded "Uncategorized" category from `drizzle/0009_item_categories.sql`,
--      then flips the column to `NOT NULL` with an FK to `item_categories(id)`
--      `ON DELETE RESTRICT`.
--
-- Wrapped in a single transaction so the schema is never left half-renamed:
--   - DDL alone could be idempotent, but the backfill UPDATE between the
--     nullable ADD and the SET NOT NULL flip makes the whole sequence
--     atomic-or-nothing.
--
-- DB column names on stock / sales / transfer / notification tables
-- (`product_id`, `product_color_id`) stay as-is by design — issues #4
-- (stock) and #5 (notifications) own that rename. Renaming them here
-- would break the scope guard on those tables.
--
-- This repo uses `drizzle-kit push`, so `src/db/schema/items.ts` and the
-- updated schema cross-referencers are the source of truth; this file is
-- the human-readable record of the DDL applied.

BEGIN;

-- 1. Rename tables.
ALTER TABLE "products" RENAME TO "items";
ALTER TABLE "product_colors" RENAME TO "item_colors";

-- 2. Rename FK column on item_colors.
ALTER TABLE "item_colors" RENAME COLUMN "product_id" TO "item_id";

-- 3. Rename indexes whose identifiers embedded the old table names.
ALTER INDEX "idx_products_article" RENAME TO "idx_items_article";
ALTER INDEX "idx_pc_product" RENAME TO "idx_ic_item";
ALTER INDEX "idx_pc_unique" RENAME TO "idx_ic_unique";

-- 4. Rename constraint identifiers embedding old table names (hygiene only;
--    Postgres preserves FK / UNIQUE behavior across renames regardless).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_colors_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "item_colors"
      RENAME CONSTRAINT "product_colors_product_id_products_id_fk"
      TO "item_colors_item_id_items_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_article_number_unique'
  ) THEN
    ALTER TABLE "items"
      RENAME CONSTRAINT "products_article_number_unique"
      TO "items_article_number_unique";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_pkey'
  ) THEN
    ALTER TABLE "items"
      RENAME CONSTRAINT "products_pkey"
      TO "items_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_colors_pkey'
  ) THEN
    ALTER TABLE "item_colors"
      RENAME CONSTRAINT "product_colors_pkey"
      TO "item_colors_pkey";
  END IF;
END
$$;

-- 5. Add the new item_category_id column (nullable so backfill can land).
ALTER TABLE "items"
  ADD COLUMN "item_category_id" uuid
  REFERENCES "item_categories"("id") ON DELETE RESTRICT;

-- 6. Backfill every existing row to the seeded "Uncategorized" bucket.
UPDATE "items"
SET "item_category_id" = (
  SELECT "id" FROM "item_categories" WHERE "name" = 'Uncategorized'
)
WHERE "item_category_id" IS NULL;

-- 7. Defensive check: any row that survived the backfill with NULL means the
--    seed row from 0009 is missing — abort instead of silently flipping
--    NOT NULL on a half-backfilled column.
DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT count(*) INTO missing_count
  FROM "items"
  WHERE "item_category_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'items.item_category_id backfill incomplete: % rows still NULL. The "Uncategorized" category seed row from 0009_item_categories.sql may be missing.',
      missing_count;
  END IF;
END
$$;

-- 8. Flip the column to NOT NULL.
ALTER TABLE "items"
  ALTER COLUMN "item_category_id" SET NOT NULL;

-- 9. Add the supporting index for category lookups.
CREATE INDEX IF NOT EXISTS "idx_items_category"
  ON "items" ("item_category_id");

COMMIT;
