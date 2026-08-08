ALTER TABLE "supply_route_lines" DROP CONSTRAINT "uq_srl_variant";--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "entry_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_srl_entry" ON "supply_route_lines" USING btree ("entry_id");--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD CONSTRAINT "uq_srl_entry_variant" UNIQUE("supply_route_id","entry_id","supplier_id","color_id","size");
