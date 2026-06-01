ALTER TABLE "store_transfer_lines" ALTER COLUMN "store_stock_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD COLUMN "item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stl_item" ON "store_transfer_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stl_variant" ON "store_transfer_lines" USING btree ("variant_id");--> statement-breakpoint
ALTER TABLE "store_transfer_lines" DROP COLUMN "minimum_sell_price_ugx";