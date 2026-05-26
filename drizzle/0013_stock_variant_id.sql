-- Inventory variant_id swap for issue #4.
--
-- This migration:
--   1. Adds a nullable `variant_id uuid` to `shop_stock` and `store_stock`.
--   2. Backfills `variant_id` by joining each row's (product_color_id, size)
--      to the matching row in `variants` (which #2's backfill seeded from
--      the cross-product of item_colors × items.sizes).
--   3. Aborts hard if any stock row could not be matched to a variant —
--      that would mean catalog drift (a stock row references a size that
--      `items.sizes` does not declare). Operators must clean the data
--      before this migration can complete.
--   4. Flips `variant_id` to NOT NULL with an ON DELETE RESTRICT FK to
--      `variants(id)`.
--   5. Drops the old `unique(shop_id, product_color_id, size)` /
--      `unique(store_id, product_color_id, size)` constraints and adds
--      the new variant-keyed equivalents (`unique(shop_id, variant_id)`,
--      `unique(store_id, variant_id)`).
--   6. Drops the old `product_color_id` + `size` columns.
--
-- Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md
--       §3 "Altered tables" + §4 step 5.
--
-- This repo uses `drizzle-kit push`, so `src/db/schema/shops.ts` and
-- `src/db/schema/store.ts` are the source of truth; this file is the
-- human-readable record of the DDL applied at the same time.
--
-- Out of scope here (separate issues):
--   - notification_threshold_overrides / low_stock_alerts /
--     restock_requisitions variant_id swap → #5
--   - server-function refactors that touched these columns → #6
--
-- Wrapped in a single transaction so the schema is never left in a
-- half-migrated state.

BEGIN;

-- 1. Add nullable variant_id columns.
ALTER TABLE "shop_stock"  ADD COLUMN "variant_id" uuid;
ALTER TABLE "store_stock" ADD COLUMN "variant_id" uuid;

-- 2. Backfill: for each stock row, find the variant whose (color_id, size)
--    pair matches. The unique constraint on variants (item_id, color_id,
--    size) guarantees at most one row per (color, size); the catalog cross-
--    product (variants backfill from #2) guarantees coverage when items.sizes
--    declares the size.
UPDATE "shop_stock" ss
SET "variant_id" = v.id
FROM "variants" v
WHERE v."color_id" = ss."product_color_id"
  AND v."size"     = ss."size";

UPDATE "store_stock" ss
SET "variant_id" = v.id
FROM "variants" v
WHERE v."color_id" = ss."product_color_id"
  AND v."size"     = ss."size";

-- 3. Assert no unmatched rows — abort if any. This is the same defensive
--    pattern as 0011_items_rename_and_category.sql step 7.
DO $$
DECLARE
  shop_missing  int;
  store_missing int;
BEGIN
  SELECT count(*) INTO shop_missing  FROM "shop_stock"  WHERE "variant_id" IS NULL;
  SELECT count(*) INTO store_missing FROM "store_stock" WHERE "variant_id" IS NULL;

  IF shop_missing > 0 THEN
    RAISE EXCEPTION
      'shop_stock.variant_id backfill incomplete: % rows still NULL. A (product_color_id, size) pair does not match any variant — likely catalog drift; run pnpm backfill:variants then retry.',
      shop_missing;
  END IF;

  IF store_missing > 0 THEN
    RAISE EXCEPTION
      'store_stock.variant_id backfill incomplete: % rows still NULL. A (product_color_id, size) pair does not match any variant — likely catalog drift; run pnpm backfill:variants then retry.',
      store_missing;
  END IF;
END
$$;

-- 4. Flip NOT NULL and add the FK to variants.
ALTER TABLE "shop_stock"  ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "store_stock" ALTER COLUMN "variant_id" SET NOT NULL;

ALTER TABLE "shop_stock"
  ADD CONSTRAINT "shop_stock_variant_id_variants_id_fk"
  FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT;

ALTER TABLE "store_stock"
  ADD CONSTRAINT "store_stock_variant_id_variants_id_fk"
  FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT;

-- 5. Swap unique constraints — drop the old (location, product_color_id,
--    size) ones and add the new variant-keyed equivalents.
ALTER TABLE "shop_stock"  DROP CONSTRAINT IF EXISTS "uq_shst_variant";
ALTER TABLE "store_stock" DROP CONSTRAINT IF EXISTS "uq_ss_variant";

ALTER TABLE "shop_stock"
  ADD CONSTRAINT "uq_shst_variant" UNIQUE ("shop_id", "variant_id");

ALTER TABLE "store_stock"
  ADD CONSTRAINT "uq_ss_variant"   UNIQUE ("store_id", "variant_id");

-- 6. Add the supporting variant lookup indexes.
CREATE INDEX IF NOT EXISTS "idx_shst_variant" ON "shop_stock"  ("variant_id");
CREATE INDEX IF NOT EXISTS "idx_ss_variant"   ON "store_stock" ("variant_id");

-- 7. Drop the (now redundant) (product_color_id) lookup indexes before
--    dropping the columns.
DROP INDEX IF EXISTS "idx_shst_pc";
DROP INDEX IF EXISTS "idx_ss_pc";

-- 8. Drop the old columns. The FK from shop_stock / store_stock to
--    item_colors is dropped automatically when the column it references
--    goes away.
ALTER TABLE "shop_stock"  DROP COLUMN "product_color_id";
ALTER TABLE "shop_stock"  DROP COLUMN "size";
ALTER TABLE "store_stock" DROP COLUMN "product_color_id";
ALTER TABLE "store_stock" DROP COLUMN "size";

COMMIT;
