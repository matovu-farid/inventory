ALTER TABLE "shop_return_line_allocations" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_return_line_allocations" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;
