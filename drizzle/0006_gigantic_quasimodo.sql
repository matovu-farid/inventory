ALTER TABLE "stock_take_lines" ADD COLUMN "item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stkl_item" ON "stock_take_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stkl_variant" ON "stock_take_lines" USING btree ("variant_id");