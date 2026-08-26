CREATE TABLE "supply_route_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supply_route_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"receipt_date" date,
	"reference" text,
	"notes" text,
	"foreign_currency" text DEFAULT 'RMB' NOT NULL,
	"exchange_rate_foreign_to_usd" numeric(10, 6),
	"exchange_rate_usd_to_ugx" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "design_snapshot" text;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "color_text_snapshot" text;--> statement-breakpoint
ALTER TABLE "supply_route_receipts" ADD CONSTRAINT "supply_route_receipts_supply_route_id_supply_routes_id_fk" FOREIGN KEY ("supply_route_id") REFERENCES "public"."supply_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_route_receipts" ADD CONSTRAINT "supply_route_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_srr_route" ON "supply_route_receipts" USING btree ("supply_route_id");--> statement-breakpoint
CREATE INDEX "idx_srr_supplier" ON "supply_route_receipts" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "supply_route_lines_receipt_id_supply_route_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."supply_route_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_srl_receipt" ON "supply_route_lines" USING btree ("receipt_id");
