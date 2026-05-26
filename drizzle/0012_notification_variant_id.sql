-- Swap (product_color_id, size) → variant_id on the three notification tables
-- (#5: notification_threshold_overrides, low_stock_alerts, restock_requisitions).
--
-- Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md
--       §3 ("Altered tables — swap …") and §4 step 6.
--
-- For every row in each table, the (color_id, size) pair matches exactly one
-- row in `variants` (the variants table was seeded from the cross product of
-- item_colors × items.sizes in 0010 + the backfill script). We backfill via
-- that join, assert no orphan rows, then drop the old composite columns and
-- swap the unique constraints over to the new variant_id column.
--
-- Wrapped in a single transaction so the schema is never left half-renamed.
--
-- This repo uses `drizzle-kit push`, so `src/db/schema/notifications.ts` is
-- the source of truth. This file is the human-readable record of the DDL.

BEGIN;

-- ============================================================================
-- 1. notification_threshold_overrides
-- ============================================================================

ALTER TABLE "notification_threshold_overrides"
  ADD COLUMN "variant_id" uuid REFERENCES "variants"("id") ON DELETE RESTRICT;

UPDATE "notification_threshold_overrides" o
SET "variant_id" = v.id
FROM "variants" v
WHERE v."color_id" = o."product_color_id"
  AND v."size" = o."size";

DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT count(*) INTO missing_count
  FROM "notification_threshold_overrides"
  WHERE "variant_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'notification_threshold_overrides backfill incomplete: % row(s) with no matching variant. Run pnpm backfill:variants first or inspect the orphan rows.',
      missing_count;
  END IF;
END
$$;

ALTER TABLE "notification_threshold_overrides"
  ALTER COLUMN "variant_id" SET NOT NULL;

-- Drop old composite unique + helper index, then drop the composite columns.
ALTER TABLE "notification_threshold_overrides"
  DROP CONSTRAINT IF EXISTS "uq_thr_override";
DROP INDEX IF EXISTS "idx_thr_override_variant";

ALTER TABLE "notification_threshold_overrides"
  DROP COLUMN "product_color_id",
  DROP COLUMN "size";

-- New unique on (scope, variant_id, shop_id) — null shop_id is treated as a
-- distinct value so "all shops" overrides coexist with per-shop overrides
-- for the same variant.
ALTER TABLE "notification_threshold_overrides"
  ADD CONSTRAINT "uq_thr_override"
  UNIQUE NULLS NOT DISTINCT ("scope", "variant_id", "shop_id");

CREATE INDEX IF NOT EXISTS "idx_thr_override_variant"
  ON "notification_threshold_overrides" ("variant_id");

-- ============================================================================
-- 2. low_stock_alerts
-- ============================================================================

ALTER TABLE "low_stock_alerts"
  ADD COLUMN "variant_id" uuid REFERENCES "variants"("id") ON DELETE RESTRICT;

UPDATE "low_stock_alerts" a
SET "variant_id" = v.id
FROM "variants" v
WHERE v."color_id" = a."product_color_id"
  AND v."size" = a."size";

DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT count(*) INTO missing_count
  FROM "low_stock_alerts"
  WHERE "variant_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'low_stock_alerts backfill incomplete: % row(s) with no matching variant.',
      missing_count;
  END IF;
END
$$;

ALTER TABLE "low_stock_alerts"
  ALTER COLUMN "variant_id" SET NOT NULL;

DROP INDEX IF EXISTS "uq_lsa_open";

ALTER TABLE "low_stock_alerts"
  DROP COLUMN "product_color_id",
  DROP COLUMN "size";

-- Partial unique-open index: at most one OPEN alert per (scope, location, variant).
CREATE UNIQUE INDEX "uq_lsa_open"
  ON "low_stock_alerts" ("scope", "location_id", "variant_id")
  WHERE status = 'open';

-- ============================================================================
-- 3. restock_requisitions
-- ============================================================================

ALTER TABLE "restock_requisitions"
  ADD COLUMN "variant_id" uuid REFERENCES "variants"("id") ON DELETE RESTRICT;

UPDATE "restock_requisitions" r
SET "variant_id" = v.id
FROM "variants" v
WHERE v."color_id" = r."product_color_id"
  AND v."size" = r."size";

DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT count(*) INTO missing_count
  FROM "restock_requisitions"
  WHERE "variant_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'restock_requisitions backfill incomplete: % row(s) with no matching variant.',
      missing_count;
  END IF;
END
$$;

ALTER TABLE "restock_requisitions"
  ALTER COLUMN "variant_id" SET NOT NULL;

DROP INDEX IF EXISTS "uq_req_open";

ALTER TABLE "restock_requisitions"
  DROP COLUMN "product_color_id",
  DROP COLUMN "size";

-- Partial unique-open index: at most one OPEN requisition per (store, variant).
CREATE UNIQUE INDEX "uq_req_open"
  ON "restock_requisitions" ("store_id", "variant_id")
  WHERE status = 'open';

COMMIT;
