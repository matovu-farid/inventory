CREATE TYPE "public"."receipt_allocation_kind" AS ENUM('aggregate', 'color', 'variant');--> statement-breakpoint
CREATE TABLE "supply_route_receipt_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"item_id" uuid,
	"supplier_id" uuid NOT NULL,
	"article_number_snapshot" text NOT NULL,
	"item_name_snapshot" text NOT NULL,
	"design_snapshot" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_foreign" numeric(15, 2) NOT NULL,
	"minimum_sell_price_ugx" numeric(15, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_srre_quantity_non_negative" CHECK ("supply_route_receipt_entries"."quantity" >= 0),
	CONSTRAINT "chk_srre_threshold_non_negative" CHECK ("supply_route_receipt_entries"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supply_route_receipt_line_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_entry_id" uuid NOT NULL,
	"kind" "receipt_allocation_kind" NOT NULL,
	"color_id" uuid,
	"color_name_snapshot" text,
	"color_hex_snapshot" text,
	"size" text,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_srrla_quantity_non_negative" CHECK ("supply_route_receipt_line_allocations"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "receipt_allocation_id" uuid;--> statement-breakpoint
ALTER TABLE "supply_route_receipt_entries" ADD CONSTRAINT "supply_route_receipt_entries_receipt_id_supply_route_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."supply_route_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_receipt_entries" ADD CONSTRAINT "supply_route_receipt_entries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_receipt_entries" ADD CONSTRAINT "supply_route_receipt_entries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_receipt_line_allocations" ADD CONSTRAINT "supply_route_receipt_line_allocations_receipt_entry_id_supply_route_receipt_entries_id_fk" FOREIGN KEY ("receipt_entry_id") REFERENCES "public"."supply_route_receipt_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_receipt_line_allocations" ADD CONSTRAINT "supply_route_receipt_line_allocations_color_id_item_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."item_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_srre_receipt" ON "supply_route_receipt_entries" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_srre_item" ON "supply_route_receipt_entries" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_srre_supplier" ON "supply_route_receipt_entries" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_srrla_entry" ON "supply_route_receipt_line_allocations" USING btree ("receipt_entry_id");--> statement-breakpoint
CREATE INDEX "idx_srrla_color" ON "supply_route_receipt_line_allocations" USING btree ("color_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_srrla_entry_cell" ON "supply_route_receipt_line_allocations" USING btree ("receipt_entry_id",coalesce("color_id"::text, lower(trim("color_name_snapshot")), ''),coalesce(lower(trim("size")), ''));--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_receipt_allocation_id_supply_route_receipt_line_allocations_id_fk" FOREIGN KEY ("receipt_allocation_id") REFERENCES "public"."supply_route_receipt_line_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_srl_receipt_allocation" ON "supply_route_lines" USING btree ("receipt_allocation_id");