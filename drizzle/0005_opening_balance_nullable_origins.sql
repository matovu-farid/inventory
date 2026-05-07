-- Allow opening-balance stock rows that didn't originate from a supply route
-- (store_stock) or store transfer (shop_stock). These origin FKs become
-- nullable so admins can seed initial inventory directly.

ALTER TABLE "store_stock" ALTER COLUMN "supply_route_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_stock" ALTER COLUMN "store_transfer_item_id" DROP NOT NULL;
