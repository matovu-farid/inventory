-- Issue #6 — supply_route_items column rename (Phase 1).
--
-- The catalog rename `products → items` and `product_colors → item_colors`
-- landed in #3, and the stock / notification tables moved to `variant_id`
-- in #4 / #5. The supply-route line table kept its old FK column names
-- (`product_id`, `product_color_id`) until now so the schema didn't change
-- shape mid-flight while #4/#5 were in review.
--
-- This migration:
--   product_id       → item_id
--   product_color_id → color_id
--
-- The TABLE name stays `supply_route_items` — the rename to
-- `supply_route_lines` lives in Phase 2 (#8). The indexes that named the
-- old columns are dropped and recreated with new names:
--   idx_sri_pc      → idx_sri_color
--   idx_sri_product → idx_sri_item
-- The unique constraint `uq_sri_variant` references the renamed column
-- automatically — its name is unchanged.
--
-- This repo uses `drizzle-kit push`, so `src/db/schema/supply-routes.ts`
-- is the source of truth; this file is the human-readable record of the
-- DDL that drizzle-kit will apply. CI runs `drizzle-kit push --force`
-- against a fresh DB and then `tsx src/db/seed.ts`, so the migration
-- must work from a clean slate.
--
-- Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md
--       §3 "Special case — supply_route_items".
--
-- Wrapped in a single transaction so the schema is never half-renamed.

BEGIN;

-- 1. Column renames. Postgres preserves FK and unique constraints across
--    ALTER COLUMN RENAME, so we don't need to drop/recreate anything but
--    the secondary indexes (whose names embed the old column names).
ALTER TABLE "supply_route_items" RENAME COLUMN "product_id"       TO "item_id";
ALTER TABLE "supply_route_items" RENAME COLUMN "product_color_id" TO "color_id";

-- 2. Rename the supporting lookup indexes to match the new column names.
ALTER INDEX IF EXISTS "idx_sri_pc"      RENAME TO "idx_sri_color";
ALTER INDEX IF EXISTS "idx_sri_product" RENAME TO "idx_sri_item";

COMMIT;
