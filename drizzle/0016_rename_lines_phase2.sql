-- Issue #8 — Phase 2: rename `*_items` transaction-line tables to `*_lines`.
--
-- Eliminates the naming collision between "Item" (catalog entity, after the
-- Phase 1 rename in #3) and transaction-line rows. After this migration
-- every line table on a transaction document is named `*_lines`.
--
-- Renames (table → table):
--   supply_route_items   → supply_route_lines
--   shop_sale_items      → shop_sale_lines
--   store_transfer_items → store_transfer_lines
--   stock_take_items     → stock_take_lines
--   shop_return_items    → shop_return_lines
--   store_return_items   → store_return_lines
--
-- FK columns that named the old tables also rename:
--   restock_requisitions.supply_route_item_id → supply_route_line_id
--   store_receivings.supply_route_item_id    → supply_route_line_id
--   store_stock.supply_route_item_id         → supply_route_line_id
--
-- Postgres preserves FK / unique / PK constraints (with their names) across
-- ALTER TABLE ... RENAME TO. Secondary indexes whose names embed the old
-- table prefix are renamed explicitly here so naming stays consistent with
-- the schema TypeScript.
--
-- This repo uses `drizzle-kit push --force` against a fresh DB on CI, so
-- `src/db/schema/*.ts` is the source of truth; this file is the human-
-- readable record of the DDL the schema files express. Wrapped in a single
-- transaction so the schema is never half-renamed.
--
-- Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md §5, §7.
-- Phase 1 precedent: drizzle/0014_supply_route_items_rename.sql.

BEGIN;

-- 1. Rename the six transaction-line tables.
ALTER TABLE "supply_route_items"   RENAME TO "supply_route_lines";
ALTER TABLE "shop_sale_items"      RENAME TO "shop_sale_lines";
ALTER TABLE "store_transfer_items" RENAME TO "store_transfer_lines";
ALTER TABLE "stock_take_items"     RENAME TO "stock_take_lines";
ALTER TABLE "shop_return_items"    RENAME TO "shop_return_lines";
ALTER TABLE "store_return_items"   RENAME TO "store_return_lines";

-- 2. Rename FK columns that named the old tables.
ALTER TABLE "restock_requisitions"
  RENAME COLUMN "supply_route_item_id" TO "supply_route_line_id";
ALTER TABLE "store_receivings"
  RENAME COLUMN "supply_route_item_id" TO "supply_route_line_id";
ALTER TABLE "store_stock"
  RENAME COLUMN "supply_route_item_id" TO "supply_route_line_id";

-- 3. Rename secondary indexes whose names embed the old table prefix.
--    (PK / FK / unique constraint names are preserved by RENAME TO and
--    are not explicitly renamed here; they reference the table by OID.)

-- supply_route_lines: idx_sri_* → idx_srl_*, uq_sri_variant → uq_srl_variant
ALTER INDEX IF EXISTS "idx_sri_route"    RENAME TO "idx_srl_route";
ALTER INDEX IF EXISTS "idx_sri_supplier" RENAME TO "idx_srl_supplier";
ALTER INDEX IF EXISTS "idx_sri_color"    RENAME TO "idx_srl_color";
ALTER INDEX IF EXISTS "idx_sri_item"     RENAME TO "idx_srl_item";
ALTER INDEX IF EXISTS "uq_sri_variant"   RENAME TO "uq_srl_variant";

-- shop_sale_lines: idx_ssi_* → idx_ssl_*
ALTER INDEX IF EXISTS "idx_ssi_sale" RENAME TO "idx_ssl_sale";

-- store_transfer_lines: idx_sti_* → idx_stl_*
ALTER INDEX IF EXISTS "idx_sti_transfer" RENAME TO "idx_stl_transfer";

-- stock_take_lines: idx_stki_* → idx_stkl_*
ALTER INDEX IF EXISTS "idx_stki_take" RENAME TO "idx_stkl_take";

-- shop_return_lines: idx_sri_return was a name clash with supply_route_items
-- on the old prefix; here it gets a disambiguated prefix `shrl`.
ALTER INDEX IF EXISTS "idx_sri_return" RENAME TO "idx_shrl_return";

-- store_return_lines: idx_storeri_* → idx_storerl_*
ALTER INDEX IF EXISTS "idx_storeri_return" RENAME TO "idx_storerl_return";

-- store_receivings.supply_route_line_id index: idx_sr_item → idx_sr_line
ALTER INDEX IF EXISTS "idx_sr_item" RENAME TO "idx_sr_line";

-- store_stock.supply_route_line_id index: idx_ss_item → idx_ss_line
ALTER INDEX IF EXISTS "idx_ss_item" RENAME TO "idx_ss_line";

COMMIT;
