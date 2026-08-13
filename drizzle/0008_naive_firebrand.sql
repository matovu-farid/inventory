ALTER TABLE "supply_route_lines" ADD COLUMN "supplier_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "article_number_snapshot" text;--> statement-breakpoint
ALTER TABLE "supply_route_lines" ADD COLUMN "item_name_snapshot" text;
--> statement-breakpoint
UPDATE "supply_route_lines" AS line
SET
  "supplier_name_snapshot" = supplier.name,
  "article_number_snapshot" = COALESCE(
    (SELECT item.article_number FROM items AS item WHERE item.id = line.item_id),
    (SELECT color_item.article_number
     FROM item_colors AS color
     JOIN items AS color_item ON color_item.id = color.item_id
     WHERE color.id = line.color_id)
  ),
  "item_name_snapshot" = COALESCE(
    (SELECT item.name FROM items AS item WHERE item.id = line.item_id),
    (SELECT color_item.name
     FROM item_colors AS color
     JOIN items AS color_item ON color_item.id = color.item_id
     WHERE color.id = line.color_id)
  )
FROM suppliers AS supplier
WHERE line.supplier_id = supplier.id;
