CREATE TABLE "supplier_codes" (
	"supplier_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "supplier_codes" ("supplier_id", "code")
SELECT "id", substr(translate(upper(md5("id"::text)), '0123456789', 'KLMNOPQRST'), 1, 8)
FROM "suppliers";--> statement-breakpoint
ALTER TABLE "item_article_numbers" ADD COLUMN "qualified_article_number" text;--> statement-breakpoint
UPDATE "item_article_numbers" AS numbers
SET "qualified_article_number" = codes."code" || ':' || upper(trim(numbers."article_number"))
FROM "items" AS catalog_items
JOIN "supplier_codes" AS codes ON codes."supplier_id" = catalog_items."supplier_id"
WHERE numbers."item_id" = catalog_items."id";--> statement-breakpoint
DROP INDEX "uq_item_article_numbers_value";--> statement-breakpoint
ALTER TABLE "supplier_codes" ADD CONSTRAINT "supplier_codes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_codes_code" ON "supplier_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_item_article_numbers_qualified" ON "item_article_numbers" USING btree ("qualified_article_number");
