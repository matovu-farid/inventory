ALTER TABLE "supply_route_lines" ADD COLUMN "color_name_snapshot" text;--> statement-breakpoint
UPDATE "supply_route_lines" AS line
SET "color_name_snapshot" = color.color_name
FROM item_colors AS color
WHERE line.color_id = color.id;
