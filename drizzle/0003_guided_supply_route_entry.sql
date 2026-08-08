ALTER TYPE "public"."supply_route_status" RENAME TO "supply_route_status_old";--> statement-breakpoint
CREATE TYPE "public"."supply_route_status" AS ENUM('open', 'received');--> statement-breakpoint
ALTER TABLE "supply_routes" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "supply_routes"
  ALTER COLUMN "status" TYPE "public"."supply_route_status"
  USING (
    CASE
      WHEN "status"::text IN ('planning', 'in_transit') THEN 'open'
      ELSE "status"::text
    END
  )::"public"."supply_route_status";--> statement-breakpoint
ALTER TABLE "supply_routes" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
DROP TYPE "public"."supply_route_status_old";
