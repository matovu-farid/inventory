-- Trim supply_route_status: drop "purchasing" and "completed".
-- Postgres can't remove enum values in place, so rebuild the type.

UPDATE "supply_routes" SET "status" = 'planning' WHERE "status" = 'purchasing';
UPDATE "supply_routes" SET "status" = 'received' WHERE "status" = 'completed';

ALTER TYPE "supply_route_status" RENAME TO "supply_route_status_old";

CREATE TYPE "supply_route_status" AS ENUM('planning', 'in_transit', 'received');

ALTER TABLE "supply_routes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "supply_routes" ALTER COLUMN "status" TYPE "supply_route_status" USING "status"::text::"supply_route_status";
ALTER TABLE "supply_routes" ALTER COLUMN "status" SET DEFAULT 'planning';

DROP TYPE "supply_route_status_old";
