ALTER TABLE "shop_stock" DROP CONSTRAINT "uq_shst_variant";--> statement-breakpoint
ALTER TABLE "shop_stock" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD COLUMN "item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD COLUMN "supply_route_line_id" uuid;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_shst_item" ON "shop_stock" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_shst_line" ON "shop_stock" USING btree ("supply_route_line_id");--> statement-breakpoint
ALTER TABLE "shop_stock" DROP COLUMN "minimum_sell_price_ugx";--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "uq_shst_shop_item_variant_line" UNIQUE NULLS NOT DISTINCT("shop_id","item_id","variant_id","supply_route_line_id");