-- Catalog: item_categories table.
--
-- Distinct from `transaction_categories` (accounting). This table groups
-- products at the catalog level. The FK from `items.item_category_id`
-- is intentionally added in a later migration so that backfilling
-- existing items into "Uncategorized" can be staged independently.
--
-- This repo uses drizzle-kit push, so `src/db/schema/item-categories.ts`
-- is the source of truth. This file is the human-readable record of the
-- DDL that was applied.

CREATE TABLE "item_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "item_categories_name_unique" UNIQUE ("name")
);--> statement-breakpoint
CREATE INDEX "idx_ic_name" ON "item_categories" ("name");--> statement-breakpoint

-- Seed the default "Uncategorized" bucket. Idempotent so re-runs are safe.
INSERT INTO "item_categories" ("name") VALUES ('Uncategorized')
ON CONFLICT ("name") DO NOTHING;
