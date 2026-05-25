-- Catalog: variants table — one row per (item, color, size).
--
-- First stage of the 3-layer catalog (item_categories → items → variants).
-- The FK columns still point at the current `products` and `product_colors`
-- tables; the rename to `items` / `item_colors` is the next issue, and
-- stock/sales/transfer tables continue to address inventory via
-- (product_color_id, size) until a later migration swaps them to
-- variant_id.
--
-- This repo uses drizzle-kit push, so `src/db/schema/variants.ts` is the
-- source of truth. This file is the human-readable record of the DDL
-- that was applied. Run `pnpm backfill:variants` after pushing to seed
-- one variant row per existing color × size combination.

CREATE TABLE "variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "color_id" uuid NOT NULL,
  "size" text NOT NULL,
  "barcode" text,
  "image_s3_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_variant_item_color_size" UNIQUE ("item_id", "color_id", "size"),
  CONSTRAINT "variants_item_id_products_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "variants_color_id_product_colors_id_fk"
    FOREIGN KEY ("color_id") REFERENCES "product_colors"("id") ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_variant_barcode" ON "variants" ("barcode") WHERE barcode IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_variant_item" ON "variants" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_variant_color" ON "variants" ("color_id");--> statement-breakpoint
