CREATE TABLE "item_color_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_color_id" uuid NOT NULL,
	"image_s3_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_color_images_s3_key_unique" UNIQUE("image_s3_key")
);
--> statement-breakpoint
CREATE TABLE "picture_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_color_id" uuid,
	"image_s3_key" text NOT NULL,
	"suggested_color_name" text,
	"suggested_color_hex" text,
	"sampled_hex" text,
	"uploaded_at" timestamp with time zone,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picture_uploads_image_s3_key_unique" UNIQUE("image_s3_key")
);
--> statement-breakpoint
DROP INDEX "picture_upload_tokens_color_consumed_idx";--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ALTER COLUMN "item_color_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ADD COLUMN "item_id" uuid;--> statement-breakpoint
UPDATE "picture_upload_tokens" AS token
SET "item_id" = color."item_id"
FROM "item_colors" AS color
WHERE token."item_color_id" = color."id";--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "picture_upload_tokens"
SET "completed_at" = "consumed_at"
WHERE "consumed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "item_color_images" ADD CONSTRAINT "item_color_images_item_color_id_item_colors_id_fk" FOREIGN KEY ("item_color_id") REFERENCES "public"."item_colors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picture_uploads" ADD CONSTRAINT "picture_uploads_token_id_picture_upload_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."picture_upload_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picture_uploads" ADD CONSTRAINT "picture_uploads_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picture_uploads" ADD CONSTRAINT "picture_uploads_item_color_id_item_colors_id_fk" FOREIGN KEY ("item_color_id") REFERENCES "public"."item_colors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_color_images_color_order_idx" ON "item_color_images" USING btree ("item_color_id","sort_order");--> statement-breakpoint
INSERT INTO "item_color_images" ("item_color_id", "image_s3_key", "sort_order")
SELECT "id", "image_s3_key", 0
FROM "item_colors"
WHERE "image_s3_key" IS NOT NULL
ON CONFLICT ("image_s3_key") DO NOTHING;--> statement-breakpoint
CREATE INDEX "picture_uploads_token_status_idx" ON "picture_uploads" USING btree ("token_id","uploaded_at","attached_at");--> statement-breakpoint
CREATE INDEX "picture_uploads_item_idx" ON "picture_uploads" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ADD CONSTRAINT "picture_upload_tokens_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "picture_upload_tokens_item_completed_idx" ON "picture_upload_tokens" USING btree ("item_id","completed_at");--> statement-breakpoint
CREATE INDEX "picture_upload_tokens_color_completed_idx" ON "picture_upload_tokens" USING btree ("item_color_id","completed_at");
