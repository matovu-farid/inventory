-- Add threshold config, per-product/shop overrides, low-stock alert deduplication,
-- and store-side restock requisitions for the low-stock notifications feature.
-- Partial unique indexes on open rows prevent duplicate open alerts/requisitions.

CREATE TYPE "public"."threshold_mode" AS ENUM('percent', 'units');--> statement-breakpoint
CREATE TYPE "public"."threshold_scope" AS ENUM('store', 'shop');--> statement-breakpoint
CREATE TYPE "public"."low_stock_alert_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."restock_requisition_status" AS ENUM('open', 'planned', 'fulfilled', 'dismissed');--> statement-breakpoint
CREATE TABLE "notification_thresholds" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "store_mode" "threshold_mode" DEFAULT 'percent' NOT NULL,
  "store_value" numeric(10, 2) DEFAULT '30' NOT NULL,
  "shop_mode" "threshold_mode" DEFAULT 'percent' NOT NULL,
  "shop_value" numeric(10, 2) DEFAULT '15' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  CONSTRAINT "ck_thresholds_singleton" CHECK ("id" = 'global'),
  CONSTRAINT "notification_thresholds_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE "notification_threshold_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" "threshold_scope" NOT NULL,
  "product_color_id" uuid NOT NULL,
  "size" text NOT NULL,
  "shop_id" uuid,
  "mode" "threshold_mode" NOT NULL,
  "value" numeric(10, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_thr_override" UNIQUE NULLS NOT DISTINCT ("scope", "product_color_id", "size", "shop_id"),
  CONSTRAINT "ck_override_scope_shop" CHECK (scope = 'shop' OR shop_id IS NULL),
  CONSTRAINT "notification_threshold_overrides_product_color_id_product_colors_id_fk" FOREIGN KEY ("product_color_id") REFERENCES "public"."product_colors"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_threshold_overrides_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE "low_stock_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" "threshold_scope" NOT NULL,
  "location_id" uuid NOT NULL,
  "product_color_id" uuid NOT NULL,
  "size" text NOT NULL,
  "status" "low_stock_alert_status" DEFAULT 'open' NOT NULL,
  "baseline_quantity" integer NOT NULL,
  "threshold_snapshot" jsonb NOT NULL,
  "quantity_at_open" integer NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "notification_id" uuid,
  CONSTRAINT "low_stock_alerts_product_color_id_product_colors_id_fk" FOREIGN KEY ("product_color_id") REFERENCES "public"."product_colors"("id") ON DELETE RESTRICT,
  CONSTRAINT "low_stock_alerts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE "restock_requisitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "product_color_id" uuid NOT NULL,
  "size" text NOT NULL,
  "suggested_quantity" integer NOT NULL,
  "baseline_quantity" integer NOT NULL,
  "quantity_at_open" integer NOT NULL,
  "status" "restock_requisition_status" DEFAULT 'open' NOT NULL,
  "supply_route_item_id" uuid,
  "dismissed_reason" text,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "restock_requisitions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE RESTRICT,
  CONSTRAINT "restock_requisitions_product_color_id_product_colors_id_fk" FOREIGN KEY ("product_color_id") REFERENCES "public"."product_colors"("id") ON DELETE RESTRICT,
  CONSTRAINT "restock_requisitions_supply_route_item_id_supply_route_items_id_fk" FOREIGN KEY ("supply_route_item_id") REFERENCES "public"."supply_route_items"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX "idx_thr_override_variant" ON "notification_threshold_overrides" ("product_color_id", "size");--> statement-breakpoint
CREATE INDEX "idx_lsa_status_scope" ON "low_stock_alerts" ("status", "scope");--> statement-breakpoint
CREATE INDEX "idx_lsa_location" ON "low_stock_alerts" ("location_id");--> statement-breakpoint
CREATE INDEX "idx_req_store_status" ON "restock_requisitions" ("store_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lsa_open" ON "low_stock_alerts" ("scope", "location_id", "product_color_id", "size") WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_req_open" ON "restock_requisitions" ("store_id", "product_color_id", "size") WHERE status = 'open';
