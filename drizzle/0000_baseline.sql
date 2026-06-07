CREATE TYPE "public"."supplier_type" AS ENUM('local', 'international');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('freight', 'shipping', 'customs', 'ticket', 'transportation', 'insurance', 'rent', 'salary', 'tax', 'miscellaneous');--> statement-breakpoint
CREATE TYPE "public"."supply_route_status" AS ENUM('planning', 'in_transit', 'received');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('pending', 'dispatched', 'received', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank', 'credit');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('settled', 'open', 'partially_paid', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('store', 'shop');--> statement-breakpoint
CREATE TYPE "public"."stock_take_status" AS ENUM('in_progress', 'completed', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."deposit_location" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."refund_method" AS ENUM('cash', 'bank', 'credit_adjustment');--> statement-breakpoint
CREATE TYPE "public"."store_return_status" AS ENUM('dispatched', 'received', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."low_stock_alert_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."restock_requisition_status" AS ENUM('open', 'planned', 'fulfilled', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."threshold_mode" AS ENUM('percent', 'units');--> statement-breakpoint
CREATE TYPE "public"."threshold_scope" AS ENUM('store', 'shop');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"shop_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "supplier_type" NOT NULL,
	"country" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_suppliers_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "supply_route_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supply_route_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" text,
	"amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'UGX',
	"exchange_rate" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_route_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supply_route_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"item_id" uuid,
	"color_id" uuid,
	"size" text,
	"quantity" integer NOT NULL,
	"unit_price_foreign" numeric(15, 2) NOT NULL,
	"foreign_currency" text DEFAULT 'RMB' NOT NULL,
	"exchange_rate_foreign_to_usd" numeric(10, 6),
	"exchange_rate_usd_to_ugx" numeric(10, 2),
	"total_amount_foreign" numeric(15, 2) NOT NULL,
	"total_amount_usd" numeric(15, 2),
	"total_cost_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_srl_variant" UNIQUE("supply_route_id","supplier_id","color_id","size")
);
--> statement-breakpoint
CREATE TABLE "supply_route_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supply_route_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "supply_route_status" DEFAULT 'planning' NOT NULL,
	"departure_date" date,
	"return_date" date,
	"budget_usd" numeric(15, 2),
	"rate_ugx_per_usd" numeric(10, 2),
	"rate_rmb_per_usd" numeric(10, 6),
	"notes" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_receivings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supply_route_line_id" uuid NOT NULL,
	"received_date" timestamp with time zone NOT NULL,
	"quantity_expected" integer NOT NULL,
	"quantity_received" integer NOT NULL,
	"discrepancy_notes" text,
	"received_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"supply_route_line_id" uuid,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ss_store_item_variant_line" UNIQUE NULLS NOT DISTINCT("store_id","item_id","variant_id","supply_route_line_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"supply_route_line_id" uuid,
	"store_transfer_item_id" uuid,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_shst_shop_item_variant_line" UNIQUE NULLS NOT DISTINCT("shop_id","item_id","variant_id","supply_route_line_id")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"manager_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfer_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_transfer_line_id" uuid NOT NULL,
	"store_stock_id" uuid NOT NULL,
	"supply_route_line_id" uuid,
	"quantity" integer NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_transfer_id" uuid NOT NULL,
	"store_stock_id" uuid,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity_dispatched" integer NOT NULL,
	"quantity_received" integer,
	"discrepancy_notes" text,
	"unit_price_ugx" numeric(15, 2) NOT NULL,
	"total_price_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"transfer_date" timestamp with time zone NOT NULL,
	"status" "transfer_status" DEFAULT 'pending' NOT NULL,
	"dispatched_by" text,
	"received_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sale_line_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_sale_line_id" uuid NOT NULL,
	"shop_stock_id" uuid NOT NULL,
	"supply_route_line_id" uuid,
	"quantity" integer NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_sale_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"shop_stock_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_ugx" numeric(15, 2) NOT NULL,
	"minimum_price_ugx" numeric(15, 2) NOT NULL,
	"is_below_minimum" boolean DEFAULT false NOT NULL,
	"below_minimum_reason" text,
	"total_price_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"sale_date" timestamp with time zone NOT NULL,
	"sold_by" text NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"bank_account_id" uuid,
	"customer_id" uuid,
	"total_amount" numeric(15, 2) NOT NULL,
	"payment_status" "payment_status" DEFAULT 'settled' NOT NULL,
	"outstanding_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"approved_by" text,
	"document_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"amount" numeric(15, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"bank_account_id" uuid,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_take_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_take_id" uuid NOT NULL,
	"store_stock_id" uuid,
	"shop_stock_id" uuid,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"system_quantity" integer NOT NULL,
	"physical_quantity" integer NOT NULL,
	"discrepancy" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_id" uuid NOT NULL,
	"stock_take_date" timestamp with time zone NOT NULL,
	"status" "stock_take_status" DEFAULT 'in_progress' NOT NULL,
	"conducted_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "category_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_categories_name_type" UNIQUE("name","type")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"category_id" uuid NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"journal_group_id" uuid NOT NULL,
	"reverses_journal_group_id" uuid,
	"reversed_by_journal_group_id" uuid,
	"transaction_date" timestamp with time zone NOT NULL,
	"description" text,
	"location_type" "location_type" NOT NULL,
	"location_id" uuid NOT NULL,
	"deposit_location" "deposit_location",
	"bank_account_id" uuid,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"article_numbers" text[] DEFAULT '{}'::text[] NOT NULL,
	"business_date" timestamp with time zone,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_numbers" (
	"prefix" text NOT NULL,
	"year" integer NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_numbers_prefix_year_pk" PRIMARY KEY("prefix","year")
);
--> statement-breakpoint
CREATE TABLE "customer_payment_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_payment_id" uuid NOT NULL,
	"shop_sale_id" uuid NOT NULL,
	"amount_applied" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"bank_account_id" uuid,
	"received_by" text NOT NULL,
	"document_number" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_return_line_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_return_line_id" uuid NOT NULL,
	"shop_stock_id" uuid NOT NULL,
	"supply_route_line_id" uuid,
	"quantity" integer NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_return_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"shop_stock_id" uuid,
	"quantity" integer NOT NULL,
	"unit_refund_price_ugx" numeric(15, 2) NOT NULL,
	"unit_cost_ugx" numeric(15, 2) NOT NULL,
	"total_refund_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"original_sale_id" uuid,
	"customer_id" uuid,
	"return_date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"refund_method" "refund_method" NOT NULL,
	"bank_account_id" uuid,
	"total_refund" numeric(15, 2) NOT NULL,
	"approved_by" text NOT NULL,
	"received_by" text NOT NULL,
	"document_number" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_return_line_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_return_line_id" uuid NOT NULL,
	"shop_stock_id" uuid NOT NULL,
	"supply_route_line_id" uuid,
	"quantity" integer NOT NULL,
	"cost_per_unit_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_return_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"shop_stock_id" uuid,
	"quantity_dispatched" integer NOT NULL,
	"quantity_received" integer,
	"unit_transfer_price_ugx" numeric(15, 2) NOT NULL,
	"unit_cost_ugx" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"original_transfer_id" uuid,
	"return_date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" "store_return_status" DEFAULT 'dispatched' NOT NULL,
	"dispatched_by" text NOT NULL,
	"received_by" text,
	"approved_by" text NOT NULL,
	"document_number" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "low_stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "threshold_scope" NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"status" "low_stock_alert_status" DEFAULT 'open' NOT NULL,
	"baseline_quantity" integer NOT NULL,
	"threshold_snapshot" jsonb NOT NULL,
	"quantity_at_open" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notification_id" uuid
);
--> statement-breakpoint
CREATE TABLE "notification_threshold_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "threshold_scope" NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"shop_id" uuid,
	"mode" "threshold_mode" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_thr_override_item" UNIQUE NULLS NOT DISTINCT("scope","item_id","shop_id"),
	CONSTRAINT "ck_override_scope_shop" CHECK ("notification_threshold_overrides"."scope" = 'shop' OR "notification_threshold_overrides"."shop_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "notification_thresholds" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"store_mode" "threshold_mode" DEFAULT 'percent' NOT NULL,
	"store_value" numeric(10, 2) DEFAULT '30' NOT NULL,
	"shop_mode" "threshold_mode" DEFAULT 'percent' NOT NULL,
	"shop_value" numeric(10, 2) DEFAULT '15' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "ck_thresholds_singleton" CHECK ("notification_thresholds"."id" = 'global')
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" uuid,
	"suggested_quantity" integer NOT NULL,
	"baseline_quantity" integer NOT NULL,
	"quantity_at_open" integer NOT NULL,
	"status" "restock_requisition_status" DEFAULT 'open' NOT NULL,
	"supply_route_line_id" uuid,
	"dismissed_reason" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"color_name" text NOT NULL,
	"color_hex" text NOT NULL,
	"image_s3_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_article_number_unique" UNIQUE("article_number")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"color_id" uuid NOT NULL,
	"size" text NOT NULL,
	"barcode" text,
	"image_s3_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_variant_item_color_size" UNIQUE("item_id","color_id","size")
);
--> statement-breakpoint
CREATE TABLE "admin_ip_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ip" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_block_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ip" text NOT NULL,
	"path" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"closure_number" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_by" text NOT NULL,
	"opening_cash_ugx" numeric(15, 2) DEFAULT '0' NOT NULL,
	"declared_cash_ugx" numeric(15, 2) NOT NULL,
	"expected_cash_ugx" numeric(15, 2) NOT NULL,
	"variance_ugx" numeric(15, 2) NOT NULL,
	"gross_sales_ugx" numeric(15, 2) NOT NULL,
	"cash_sales_ugx" numeric(15, 2) NOT NULL,
	"bank_sales_ugx" numeric(15, 2) NOT NULL,
	"credit_sales_ugx" numeric(15, 2) NOT NULL,
	"sales_count" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picture_upload_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"item_color_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"uploaded_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picture_upload_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_expenses" ADD CONSTRAINT "supply_route_expenses_supply_route_id_supply_routes_id_fk" FOREIGN KEY ("supply_route_id") REFERENCES "public"."supply_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_supply_route_id_supply_routes_id_fk" FOREIGN KEY ("supply_route_id") REFERENCES "public"."supply_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_color_id_item_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."item_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_suppliers" ADD CONSTRAINT "supply_route_suppliers_supply_route_id_supply_routes_id_fk" FOREIGN KEY ("supply_route_id") REFERENCES "public"."supply_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_suppliers" ADD CONSTRAINT "supply_route_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receivings" ADD CONSTRAINT "store_receivings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receivings" ADD CONSTRAINT "store_receivings_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receivings" ADD CONSTRAINT "store_receivings_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_stock" ADD CONSTRAINT "shop_stock_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_store_transfer_line_id_store_transfer_lines_id_fk" FOREIGN KEY ("store_transfer_line_id") REFERENCES "public"."store_transfer_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_store_stock_id_store_stock_id_fk" FOREIGN KEY ("store_stock_id") REFERENCES "public"."store_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_store_transfer_id_store_transfers_id_fk" FOREIGN KEY ("store_transfer_id") REFERENCES "public"."store_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_store_stock_id_store_stock_id_fk" FOREIGN KEY ("store_stock_id") REFERENCES "public"."store_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_lines" ADD CONSTRAINT "store_transfer_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_dispatched_by_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_line_allocations" ADD CONSTRAINT "shop_sale_line_allocations_shop_sale_line_id_shop_sale_lines_id_fk" FOREIGN KEY ("shop_sale_line_id") REFERENCES "public"."shop_sale_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_line_allocations" ADD CONSTRAINT "shop_sale_line_allocations_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_line_allocations" ADD CONSTRAINT "shop_sale_line_allocations_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_lines" ADD CONSTRAINT "shop_sale_lines_shop_sale_id_shop_sales_id_fk" FOREIGN KEY ("shop_sale_id") REFERENCES "public"."shop_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_lines" ADD CONSTRAINT "shop_sale_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_lines" ADD CONSTRAINT "shop_sale_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sale_lines" ADD CONSTRAINT "shop_sale_lines_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_sold_by_user_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_expenses" ADD CONSTRAINT "location_expenses_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_expenses" ADD CONSTRAINT "location_expenses_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_stock_take_id_stock_takes_id_fk" FOREIGN KEY ("stock_take_id") REFERENCES "public"."stock_takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_store_stock_id_store_stock_id_fk" FOREIGN KEY ("store_stock_id") REFERENCES "public"."store_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_conducted_by_user_id_fk" FOREIGN KEY ("conducted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_transaction_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_applications" ADD CONSTRAINT "customer_payment_applications_customer_payment_id_customer_payments_id_fk" FOREIGN KEY ("customer_payment_id") REFERENCES "public"."customer_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_applications" ADD CONSTRAINT "customer_payment_applications_shop_sale_id_shop_sales_id_fk" FOREIGN KEY ("shop_sale_id") REFERENCES "public"."shop_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_line_allocations" ADD CONSTRAINT "shop_return_line_allocations_shop_return_line_id_shop_return_lines_id_fk" FOREIGN KEY ("shop_return_line_id") REFERENCES "public"."shop_return_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_line_allocations" ADD CONSTRAINT "shop_return_line_allocations_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_line_allocations" ADD CONSTRAINT "shop_return_line_allocations_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_lines" ADD CONSTRAINT "shop_return_lines_shop_return_id_shop_returns_id_fk" FOREIGN KEY ("shop_return_id") REFERENCES "public"."shop_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_lines" ADD CONSTRAINT "shop_return_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_lines" ADD CONSTRAINT "shop_return_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_return_lines" ADD CONSTRAINT "shop_return_lines_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_original_sale_id_shop_sales_id_fk" FOREIGN KEY ("original_sale_id") REFERENCES "public"."shop_sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_returns" ADD CONSTRAINT "shop_returns_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_line_allocations" ADD CONSTRAINT "store_return_line_allocations_store_return_line_id_store_return_lines_id_fk" FOREIGN KEY ("store_return_line_id") REFERENCES "public"."store_return_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_line_allocations" ADD CONSTRAINT "store_return_line_allocations_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_line_allocations" ADD CONSTRAINT "store_return_line_allocations_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_lines" ADD CONSTRAINT "store_return_lines_store_return_id_store_returns_id_fk" FOREIGN KEY ("store_return_id") REFERENCES "public"."store_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_lines" ADD CONSTRAINT "store_return_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_lines" ADD CONSTRAINT "store_return_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_return_lines" ADD CONSTRAINT "store_return_lines_shop_stock_id_shop_stock_id_fk" FOREIGN KEY ("shop_stock_id") REFERENCES "public"."shop_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_original_transfer_id_store_transfers_id_fk" FOREIGN KEY ("original_transfer_id") REFERENCES "public"."store_transfers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_dispatched_by_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "low_stock_alerts" ADD CONSTRAINT "low_stock_alerts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "low_stock_alerts" ADD CONSTRAINT "low_stock_alerts_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "low_stock_alerts" ADD CONSTRAINT "low_stock_alerts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_threshold_overrides" ADD CONSTRAINT "notification_threshold_overrides_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_threshold_overrides" ADD CONSTRAINT "notification_threshold_overrides_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_threshold_overrides" ADD CONSTRAINT "notification_threshold_overrides_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_thresholds" ADD CONSTRAINT "notification_thresholds_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requisitions" ADD CONSTRAINT "restock_requisitions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requisitions" ADD CONSTRAINT "restock_requisitions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requisitions" ADD CONSTRAINT "restock_requisitions_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requisitions" ADD CONSTRAINT "restock_requisitions_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_colors" ADD CONSTRAINT "item_colors_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_color_id_item_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."item_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ip_allowlist" ADD CONSTRAINT "admin_ip_allowlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_closures" ADD CONSTRAINT "shift_closures_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_closures" ADD CONSTRAINT "shift_closures_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ADD CONSTRAINT "picture_upload_tokens_item_color_id_item_colors_id_fk" FOREIGN KEY ("item_color_id") REFERENCES "public"."item_colors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picture_upload_tokens" ADD CONSTRAINT "picture_upload_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sre_route" ON "supply_route_expenses" USING btree ("supply_route_id");--> statement-breakpoint
CREATE INDEX "idx_srl_route" ON "supply_route_lines" USING btree ("supply_route_id");--> statement-breakpoint
CREATE INDEX "idx_srl_supplier" ON "supply_route_lines" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_srl_color" ON "supply_route_lines" USING btree ("color_id");--> statement-breakpoint
CREATE INDEX "idx_srl_item" ON "supply_route_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_srs_route" ON "supply_route_suppliers" USING btree ("supply_route_id");--> statement-breakpoint
CREATE INDEX "idx_srs_supplier" ON "supply_route_suppliers" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_route_external_ref" ON "supply_routes" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "idx_sr_store" ON "store_receivings" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_sr_line" ON "store_receivings" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_ss_store" ON "store_stock" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_ss_item" ON "store_stock" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_ss_line" ON "store_stock" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_ss_variant" ON "store_stock" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_shst_shop" ON "shop_stock" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_shst_item" ON "shop_stock" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_shst_variant" ON "shop_stock" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_shst_line" ON "shop_stock" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_shst_transfer_item" ON "shop_stock" USING btree ("store_transfer_item_id");--> statement-breakpoint
CREATE INDEX "idx_sta_line" ON "store_transfer_allocations" USING btree ("store_transfer_line_id");--> statement-breakpoint
CREATE INDEX "idx_sta_stock" ON "store_transfer_allocations" USING btree ("store_stock_id");--> statement-breakpoint
CREATE INDEX "idx_sta_supply_line" ON "store_transfer_allocations" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_stl_transfer" ON "store_transfer_lines" USING btree ("store_transfer_id");--> statement-breakpoint
CREATE INDEX "idx_stl_item" ON "store_transfer_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stl_variant" ON "store_transfer_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_st_store" ON "store_transfers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_st_shop" ON "store_transfers" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_st_status" ON "store_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ssla_line" ON "shop_sale_line_allocations" USING btree ("shop_sale_line_id");--> statement-breakpoint
CREATE INDEX "idx_ssla_stock" ON "shop_sale_line_allocations" USING btree ("shop_stock_id");--> statement-breakpoint
CREATE INDEX "idx_ssla_supply_line" ON "shop_sale_line_allocations" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_ssl_sale" ON "shop_sale_lines" USING btree ("shop_sale_id");--> statement-breakpoint
CREATE INDEX "idx_ssl_item" ON "shop_sale_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_sale_shop" ON "shop_sales" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_sale_date" ON "shop_sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "idx_sale_soldby" ON "shop_sales" USING btree ("sold_by");--> statement-breakpoint
CREATE INDEX "idx_sale_customer" ON "shop_sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_sale_status" ON "shop_sales" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_le_location" ON "location_expenses" USING btree ("location_type","location_id");--> statement-breakpoint
CREATE INDEX "idx_le_date" ON "location_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "idx_stkl_take" ON "stock_take_lines" USING btree ("stock_take_id");--> statement-breakpoint
CREATE INDEX "idx_stkl_item" ON "stock_take_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stkl_variant" ON "stock_take_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_stk_location" ON "stock_takes" USING btree ("location_type","location_id");--> statement-breakpoint
CREATE INDEX "idx_stk_date" ON "stock_takes" USING btree ("stock_take_date");--> statement-breakpoint
CREATE INDEX "idx_tc_name" ON "transaction_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_txn_date" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_txn_category" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_txn_journal_group" ON "transactions" USING btree ("journal_group_id");--> statement-breakpoint
CREATE INDEX "idx_txn_reference" ON "transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_txn_location" ON "transactions" USING btree ("location_type","location_id");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_business_date" ON "audit_logs" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "idx_audit_articles" ON "audit_logs" USING gin ("article_numbers");--> statement-breakpoint
CREATE INDEX "idx_idempotency_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_cpa_payment" ON "customer_payment_applications" USING btree ("customer_payment_id");--> statement-breakpoint
CREATE INDEX "idx_cpa_sale" ON "customer_payment_applications" USING btree ("shop_sale_id");--> statement-breakpoint
CREATE INDEX "idx_cp_customer" ON "customer_payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_cp_shop" ON "customer_payments" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_cp_date" ON "customer_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_customer_name" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_shrla_line" ON "shop_return_line_allocations" USING btree ("shop_return_line_id");--> statement-breakpoint
CREATE INDEX "idx_shrla_stock" ON "shop_return_line_allocations" USING btree ("shop_stock_id");--> statement-breakpoint
CREATE INDEX "idx_shrla_supply_line" ON "shop_return_line_allocations" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_shrl_return" ON "shop_return_lines" USING btree ("shop_return_id");--> statement-breakpoint
CREATE INDEX "idx_shrl_item" ON "shop_return_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_sr_shop" ON "shop_returns" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_sr_date" ON "shop_returns" USING btree ("return_date");--> statement-breakpoint
CREATE INDEX "idx_sr_customer" ON "shop_returns" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_storla_line" ON "store_return_line_allocations" USING btree ("store_return_line_id");--> statement-breakpoint
CREATE INDEX "idx_storla_stock" ON "store_return_line_allocations" USING btree ("shop_stock_id");--> statement-breakpoint
CREATE INDEX "idx_storla_supply_line" ON "store_return_line_allocations" USING btree ("supply_route_line_id");--> statement-breakpoint
CREATE INDEX "idx_storerl_return" ON "store_return_lines" USING btree ("store_return_id");--> statement-breakpoint
CREATE INDEX "idx_storerl_item" ON "store_return_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_storeret_shop" ON "store_returns" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_storeret_store" ON "store_returns" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_storeret_status" ON "store_returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lsa_status_scope" ON "low_stock_alerts" USING btree ("status","scope");--> statement-breakpoint
CREATE INDEX "idx_lsa_location" ON "low_stock_alerts" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_lsa_item" ON "low_stock_alerts" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lsa_open_item" ON "low_stock_alerts" USING btree ("scope","location_id","item_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "idx_thr_override_item" ON "notification_threshold_overrides" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_notif_user" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_notif_kind" ON "notifications" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_req_store_status" ON "restock_requisitions" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_req_item" ON "restock_requisitions" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_req_open_item" ON "restock_requisitions" USING btree ("store_id","item_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "idx_ic_item" ON "item_colors" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_ic_unique" ON "item_colors" USING btree ("item_id","color_name");--> statement-breakpoint
CREATE INDEX "idx_items_article" ON "items" USING btree ("article_number");--> statement-breakpoint
CREATE INDEX "idx_items_category" ON "items" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_variant_barcode" ON "variants" USING btree ("barcode") WHERE barcode IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_variant_item" ON "variants" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_variant_color" ON "variants" USING btree ("color_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_ip_allowlist_user_ip_idx" ON "admin_ip_allowlist" USING btree ("user_id","ip");--> statement-breakpoint
CREATE INDEX "admin_ip_allowlist_user_idx" ON "admin_ip_allowlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_ip_allowlist_ip_idx" ON "admin_ip_allowlist" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "ip_block_log_attempted_at_idx" ON "ip_block_log" USING btree ("attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_closures_shop_number_idx" ON "shift_closures" USING btree ("shop_id","closure_number");--> statement-breakpoint
CREATE INDEX "shift_closures_shop_closed_idx" ON "shift_closures" USING btree ("shop_id","closed_at");--> statement-breakpoint
CREATE INDEX "picture_upload_tokens_color_consumed_idx" ON "picture_upload_tokens" USING btree ("item_color_id","consumed_at");