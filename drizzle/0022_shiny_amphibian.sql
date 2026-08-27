UPDATE "items" SET "low_stock_threshold" = 0 WHERE "low_stock_threshold" IS NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "low_stock_threshold" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "low_stock_threshold" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "low_stock_threshold" integer DEFAULT 0 NOT NULL;
