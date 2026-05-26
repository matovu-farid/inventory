-- Issue #7: drop the now-redundant `items.sizes text[]` column.
--
-- After issue #2 introduced the `variants` table (one row per item ×
-- color × size) and the backfill in `scripts/backfill-variants.ts`
-- populated every (color, size) pair into the variants table, the
-- declarative `items.sizes` array was duplicated state. Issue #7 made
-- the variants table the sole source of truth for an item's sizes:
-- create / edit flows materialise variants directly, and the UI calls
-- `deriveSizes(item.variants)` to render the size grid.
--
-- CI runs `drizzle-kit push --force` so the schema-side change in
-- `src/db/schema/items.ts` is what actually drops the column in CI and
-- dev. This file is the human-readable record of the DDL applied to
-- production.

ALTER TABLE "items" DROP COLUMN IF EXISTS "sizes";
