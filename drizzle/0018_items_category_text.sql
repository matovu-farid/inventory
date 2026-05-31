-- Items free-text category — replaces the items.item_category_id FK and
-- drops the item_categories table.
--
-- Safe because the system is greenfield: zero rows in items and zero in
-- item_categories at the time of this migration. If you're applying this
-- to a non-empty DB you MUST first run:
--   ALTER TABLE items ADD COLUMN category text;
--   UPDATE items SET category = ic.name
--     FROM item_categories ic WHERE items.item_category_id = ic.id;
--   ALTER TABLE items ALTER COLUMN category SET NOT NULL;
-- before running the DROPs below.
--
-- This repo uses drizzle-kit push, so src/db/schema/items.ts is the
-- source of truth — this file is the human-readable record of the DDL.

ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_item_category_id_item_categories_id_fk";
DROP INDEX IF EXISTS "idx_items_category";
ALTER TABLE "items" DROP COLUMN IF EXISTS "item_category_id";
ALTER TABLE "items" ADD COLUMN "category" text NOT NULL;
CREATE INDEX "idx_items_category" ON "items" ("category");
DROP TABLE IF EXISTS "item_categories";
