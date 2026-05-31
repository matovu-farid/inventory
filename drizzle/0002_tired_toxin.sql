ALTER TABLE "store_stock" DROP CONSTRAINT "uq_ss_variant";--> statement-breakpoint
ALTER TABLE "store_stock" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_stock" ADD COLUMN "item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ss_item" ON "store_stock" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "store_stock" DROP COLUMN "minimum_sell_price_ugx";--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "uq_ss_store_item_variant_line" UNIQUE NULLS NOT DISTINCT("store_id","item_id","variant_id","supply_route_line_id");