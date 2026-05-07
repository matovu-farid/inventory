ALTER TABLE "supply_routes" ADD COLUMN "default_foreign_currency" varchar(8);--> statement-breakpoint
ALTER TABLE "supply_routes" ADD COLUMN "default_exchange_rate_foreign_to_usd" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "supply_routes" ADD COLUMN "default_exchange_rate_usd_to_ugx" numeric(10, 2);
