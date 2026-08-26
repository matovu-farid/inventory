ALTER TABLE "supply_route_receipts" ADD COLUMN "source_entry_id" uuid;
--> statement-breakpoint
INSERT INTO "supply_route_receipts" (
  "supply_route_id",
  "supplier_id",
  "source_entry_id",
  "foreign_currency",
  "exchange_rate_foreign_to_usd",
  "exchange_rate_usd_to_ugx"
)
SELECT DISTINCT ON ("supply_route_id", "entry_id", "supplier_id")
  "supply_route_id",
  "supplier_id",
  "entry_id",
  "foreign_currency",
  "exchange_rate_foreign_to_usd",
  "exchange_rate_usd_to_ugx"
FROM "supply_route_lines"
WHERE "receipt_id" IS NULL
ORDER BY "supply_route_id", "entry_id", "supplier_id", "created_at", "id";
--> statement-breakpoint
UPDATE "supply_route_lines" AS line
SET
  "receipt_id" = receipt."id",
  "design_snapshot" = COALESCE(line."design_snapshot", line."item_name_snapshot"),
  "color_text_snapshot" = COALESCE(line."color_text_snapshot", line."color_name_snapshot")
FROM "supply_route_receipts" AS receipt
WHERE line."receipt_id" IS NULL
  AND receipt."supply_route_id" = line."supply_route_id"
  AND receipt."source_entry_id" = line."entry_id"
  AND receipt."supplier_id" = line."supplier_id";
