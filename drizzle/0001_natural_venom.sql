ALTER TABLE "items" ADD COLUMN "minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "low_stock_threshold" integer;