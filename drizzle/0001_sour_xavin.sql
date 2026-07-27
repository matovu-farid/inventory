ALTER TABLE "supply_route_lines" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_stock" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cost_price" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cost_currency" text;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;