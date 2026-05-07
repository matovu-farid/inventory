ALTER TABLE "supply_routes" DROP COLUMN IF EXISTS "default_foreign_currency";
ALTER TABLE "supply_routes" DROP COLUMN IF EXISTS "default_exchange_rate_foreign_to_usd";
ALTER TABLE "supply_routes" DROP COLUMN IF EXISTS "default_exchange_rate_usd_to_ugx";
ALTER TABLE "supply_routes" ADD COLUMN "rate_ugx_per_usd" numeric(10, 2);
ALTER TABLE "supply_routes" ADD COLUMN "rate_rmb_per_usd" numeric(10, 6);
ALTER TABLE "supply_routes" ADD COLUMN "rate_bht_per_usd" numeric(10, 6);
