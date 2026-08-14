CREATE TABLE "item_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"image_s3_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"suggested_color_name" text,
	"suggested_color_hex" text,
	"sampled_hex" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_images_s3_key_unique" UNIQUE("image_s3_key")
);
--> statement-breakpoint
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_images_item_order_idx" ON "item_images" USING btree ("item_id","sort_order");--> statement-breakpoint
INSERT INTO "item_images" (
	"item_id",
	"image_s3_key",
	"sort_order",
	"suggested_color_name",
	"suggested_color_hex"
)
SELECT
	color."item_id",
	image."image_s3_key",
	ROW_NUMBER() OVER (
		PARTITION BY color."item_id"
		ORDER BY image."sort_order", image."created_at", image."id"
	) - 1,
	color."color_name",
	color."color_hex"
FROM "item_color_images" AS image
INNER JOIN "item_colors" AS color ON color."id" = image."item_color_id"
ON CONFLICT ("image_s3_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "item_images" (
	"item_id",
	"image_s3_key",
	"sort_order",
	"suggested_color_name",
	"suggested_color_hex"
)
SELECT
	color."item_id",
	color."image_s3_key",
	COALESCE(existing."next_order", 0),
	color."color_name",
	color."color_hex"
FROM "item_colors" AS color
LEFT JOIN LATERAL (
	SELECT MAX("sort_order") + 1 AS "next_order"
	FROM "item_images"
	WHERE "item_id" = color."item_id"
) AS existing ON TRUE
WHERE color."image_s3_key" IS NOT NULL
  AND NOT EXISTS (
	SELECT 1 FROM "item_images" AS image
	WHERE image."image_s3_key" = color."image_s3_key"
  )
ON CONFLICT ("image_s3_key") DO NOTHING;
