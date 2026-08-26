ALTER TABLE "supplier_codes" DROP CONSTRAINT "supplier_codes_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_codes" ADD CONSTRAINT "supplier_codes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;