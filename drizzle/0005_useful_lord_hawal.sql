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
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_store_transfer_line_id_store_transfer_lines_id_fk" FOREIGN KEY ("store_transfer_line_id") REFERENCES "public"."store_transfer_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_store_stock_id_store_stock_id_fk" FOREIGN KEY ("store_stock_id") REFERENCES "public"."store_stock"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_allocations" ADD CONSTRAINT "store_transfer_allocations_supply_route_line_id_supply_route_lines_id_fk" FOREIGN KEY ("supply_route_line_id") REFERENCES "public"."supply_route_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sta_line" ON "store_transfer_allocations" USING btree ("store_transfer_line_id");--> statement-breakpoint
CREATE INDEX "idx_sta_stock" ON "store_transfer_allocations" USING btree ("store_stock_id");--> statement-breakpoint
CREATE INDEX "idx_sta_supply_line" ON "store_transfer_allocations" USING btree ("supply_route_line_id");