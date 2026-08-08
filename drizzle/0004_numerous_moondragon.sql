CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_item_categories_name" ON "item_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_item_categories_active_name" ON "item_categories" USING btree ("name") WHERE "deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "item_categories" ("name")
SELECT DISTINCT "category" FROM "items";--> statement-breakpoint
UPDATE "items" AS i
SET "category_id" = c."id"
FROM "item_categories" AS c
WHERE c."name" = i."category" AND c."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE restrict ON UPDATE no action;
