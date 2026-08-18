CREATE TABLE "item_article_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"article_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_article_numbers" ADD CONSTRAINT "item_article_numbers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_item_article_numbers_value" ON "item_article_numbers" USING btree ("article_number");
--> statement-breakpoint
CREATE INDEX "idx_item_article_numbers_item" ON "item_article_numbers" USING btree ("item_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT upper(trim("article_number"))
    FROM "items"
    GROUP BY upper(trim("article_number"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: article-number collision after normalization';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "item_article_numbers" ("item_id", "article_number")
SELECT "id", upper(trim("article_number")) FROM "items";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_category_id_item_categories_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_items_article";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_items_category";
--> statement-breakpoint
ALTER TABLE "items" RENAME COLUMN "category" TO "design";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "category_id";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_article_number_unique";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "article_number";
--> statement-breakpoint
DROP TABLE IF EXISTS "item_categories";
--> statement-breakpoint
CREATE INDEX "idx_items_design" ON "items" USING btree ("design");
