# Category / Item / Variant — Design Spec

**Date:** 2026-05-24
**Status:** Draft — awaiting review
**Owner:** matovu-farid
**Supersedes (catalog vocabulary only):** `2026-05-11-item-variants-and-images-design.md`

## 1. Goal

Reshape the catalog into a clear three-layer hierarchy and make a Variant
(specific color + size combination) a first-class entity.

```
Category (new)   →   "Shirts", "Trousers", "Jackets" — pure grouping label
  └── Item        ←  what `products` is today; article-numbered SKU
        ├── Color  ←  what `product_colors` is today; one row per color (with image)
        └── Variant (new)  ←  one row per (color × size); the unit of stock/sale/transfer
```

This frees stock, sales, transfers, returns, and notifications from carrying a
composite `(product_color_id, size_string)` key — they all reference a single
`variant_id`. It also frees the word "item" in transaction line tables
(`supply_route_items`, `shop_sale_items`, etc.) by renaming them to `*_lines`.

## 2. Decisions captured

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Role of Category | Pure label, no business data, mandatory FK on Item |
| D2 | Category structure | Flat (no hierarchy) |
| D3 | Variant model | **First-class** — one row per (color × size) |
| D4 | Variant attribute axes | Strictly color + size (no generic option model) |
| D5 | Sizes representation | Plain `text` column on Variant (no sizes table) |
| D6 | Variant attributes (v1) | `barcode` (nullable, unique-when-set), `image_s3_key` (nullable, falls back to Color image) |
| D7 | Per-variant pricing | Out of scope — pricing remains on supply lines |
| D8 | `items.sizes text[]` | **Dropped** — sizes are implicit via the set of variants |
| D9 | Naming collision for `*_items` | Rename all transaction line tables to `*_lines` |
| D10 | Migration shape | **Phased**: Phase 1 = catalog + stock refactor; Phase 2 = pure rename of transaction tables |
| D11 | Category seed | One row, `"Uncategorized"`; user re-assigns via admin UI in Phase 1 |
| D12 | Supply route line shape | Keep its three nullable modes (aggregate / color-only / full); add no `variant_id` — receiving resolves to a variant |
| D13 | Audit logs | Historical `entityType` strings left as-is; new rows use `item`, `item_color`, `variant` |
| D14 | UI vocabulary | "Item" in UI copy where it means a SKU; existing "items" copy that refers to line counts (cart, transfer) is left alone — it still reads correctly |

## 3. Data model — Phase 1

### New table — `item_categories`

Named to mirror the existing `transaction_categories` table (financial categories like freight/shipping/rent used by the accounting module). A bare `categories` would be ambiguous next to it.

```ts
item_categories = {
  id: uuid pk default gen_random_uuid(),
  name: text not null unique,
  createdAt, updatedAt,
}
```

Drizzle symbol: `itemCategories`. UI route stays `/settings/categories` — users don't see the collision since `transaction_categories` is internal accounting.

Seed: one row `{ name: 'Uncategorized' }`.

### New table — `variants`

```ts
variants = {
  id: uuid pk default gen_random_uuid(),
  itemId: uuid not null fk items on delete cascade,
  colorId: uuid not null fk item_colors on delete restrict,
  size: text not null,
  barcode: text nullable,
  imageS3Key: text nullable,
  createdAt, updatedAt,

  unique(itemId, colorId, size),
}
```

Indexes:
- `variants(item_id, color_id, size)` unique (implicit)
- `variants(barcode)` unique partial — `WHERE barcode IS NOT NULL`
- `variants(color_id)` lookup
- `variants(item_id)` lookup

### Renamed tables (Phase 1 covers only these two — they’re the data-shape changes)

| From | To |
|---|---|
| `products` | `items` |
| `product_colors` | `item_colors` |

Column renames inside the renamed tables:
- `product_colors.product_id` → `item_colors.item_id`
- Indexes renamed to match (`idx_pc_*` → `idx_ic_*`).

### Altered table — `items`

- Add `item_category_id uuid not null fk item_categories on delete restrict`.
- **Drop** `sizes text[]`.

### Altered tables — swap `(product_color_id, size)` for `variant_id`

| Table | Before | After |
|---|---|---|
| `shop_stock` | `product_color_id` + `size`; unique `(shop_id, product_color_id, size)` | `variant_id`; unique `(shop_id, variant_id)` |
| `store_stock` | same | `variant_id`; unique `(store_id, variant_id)` |
| `notification_threshold_overrides` | `product_color_id` + `size` (with `unique(scope, product_color_id, size, shop_id)`) | `variant_id` (unique `(scope, variant_id, shop_id)`) |
| `low_stock_alerts` | `product_color_id` + `size` (unique-open `(scope, location_id, product_color_id, size)`) | `variant_id` (unique-open `(scope, location_id, variant_id)`) |
| `restock_requisitions` | `product_color_id` + `size` (unique-open `(store_id, product_color_id, size)`) | `variant_id` (unique-open `(store_id, variant_id)`) |

Dependent transaction-line tables (`shop_sale_items`, `store_transfer_items`,
`stock_take_items`, `shop_return_items`, `store_return_items`) reference stock
rows (`shop_stock_id` / `store_stock_id`), so they pick up the variant change
transitively — no direct column changes needed in Phase 1. They keep their
`*_items` names until Phase 2.

`picture_upload_tokens` stays color-level (photos belong to colors).

### Special case — `supply_route_items` (Phase 1)

Today it supports three procurement modes via nullable columns:
- **Aggregate** — only `product_id` set
- **Color-only** — `product_id` + `product_color_id`
- **Full** — `product_id` + `product_color_id` + `size`

We keep that shape. Renames only:
- `product_id` → `item_id`
- `product_color_id` → `color_id`
- `size` stays

Receiving resolves a full-mode line to a `variant_id` (creating the variant if
it doesn’t exist yet) when posting to `store_stock`.

The table itself is renamed to `supply_route_lines` in **Phase 2** along with
the other transaction-line tables.

## 4. Backfill — Phase 1

Single Drizzle migration; single transaction.

### Pre-flight assertions (fail loudly if violated)

```sql
-- every (product_color_id, size) in stock has a matching size in items.sizes
select count(*) from shop_stock ss
  join product_colors pc on pc.id = ss.product_color_id
  join products p on p.id = pc.product_id
  where not (ss.size = any(p.sizes));
-- expect: 0; same check for store_stock, threshold_overrides
```

If any check is non-zero, the migration aborts; data must be cleaned first.

### Steps

1. `CREATE TABLE item_categories ...; INSERT INTO item_categories (name) VALUES ('Uncategorized');`
2. `ALTER TABLE products RENAME TO items;`
   `ALTER TABLE product_colors RENAME TO item_colors;`
   `ALTER TABLE item_colors RENAME COLUMN product_id TO item_id;`
   Rename indexes / sequences / FK constraint names accordingly.
3. `ALTER TABLE items ADD COLUMN item_category_id uuid REFERENCES item_categories(id);`
   `UPDATE items SET item_category_id = (SELECT id FROM item_categories WHERE name = 'Uncategorized');`
   `ALTER TABLE items ALTER COLUMN item_category_id SET NOT NULL;`
4. `CREATE TABLE variants ...;`
   `INSERT INTO variants (item_id, color_id, size) SELECT ic.item_id, ic.id, unnest(i.sizes) FROM item_colors ic JOIN items i ON i.id = ic.item_id;`
5. For each of `shop_stock`, `store_stock`, `notification_threshold_overrides`:
   - `ALTER TABLE ... ADD COLUMN variant_id uuid REFERENCES variants(id);`
   - `UPDATE ... SET variant_id = (SELECT v.id FROM variants v JOIN item_colors ic ON ic.id = v.color_id WHERE v.color_id = product_color_id AND v.size = size);`
   - Assert no NULL variant_id rows; abort if any.
   - `ALTER TABLE ... ALTER COLUMN variant_id SET NOT NULL;`
   - Drop the old unique constraint; add the new one.
   - `ALTER TABLE ... DROP COLUMN product_color_id, DROP COLUMN size;`
6. For `low_stock_alerts`, `restock_requisitions`: same pattern as step 5 — both already carry `(product_color_id, size)`; join on those to fill `variant_id`, drop the old columns, replace the unique-partial index with the variant-keyed equivalent (preserving the `WHERE status = 'open'` predicate).
7. Rename `supply_route_items` columns: `product_id` → `item_id`, `product_color_id` → `color_id`. Do **not** rename the table yet.
8. `ALTER TABLE items DROP COLUMN sizes;`

### Variant generation policy

Variants are generated from the **existing cross product** of `(item_color, item.sizes[])`. This means every (color, size) pair that the catalog declared today becomes a row, even if it has no stock. That matches the old "declared sizes" semantic and prevents data loss.

After migration, an admin can prune unused variants via the admin UI (delete a variant; FK with `restrict` blocks deletion if stock/sales reference it).

## 5. Data model — Phase 2 (transaction-line rename)

Pure rename. No data movement. No new columns.

| From | To |
|---|---|
| `supply_route_items` | `supply_route_lines` |
| `shop_sale_items` | `shop_sale_lines` |
| `store_transfer_items` | `store_transfer_lines` |
| `stock_take_items` | `stock_take_lines` |
| `shop_return_items` | `shop_return_lines` |
| `store_return_items` | `store_return_lines` |

Index names, FK constraint names, Drizzle relation names, and TypeScript
identifiers all renamed in lockstep. FK columns that name the old tables also
rename: `restock_requisitions.supply_route_item_id` → `supply_route_line_id`,
and any equivalent column on receipts or audit references.

Audit-log `entityType` going forward emits `supply_route_line`, `shop_sale_line`, etc. Historical strings are not rewritten.

## 6. Code surface — Phase 1

### Schema files
- `src/db/schema/products.ts` → `src/db/schema/items.ts` (renamed file)
- Add `src/db/schema/item-categories.ts` (exports `itemCategories`)
- Add `src/db/schema/variants.ts`
- Update imports across all schema files that reference `products` / `productColors`.

### Server functions touched (variant_id swap)
- `src/server/functions/store/receiving.ts` — receive against variant_id; create variant if Phase-1 supply line was aggregate/color-only and operator now specifies full breakdown.
- `src/server/functions/store/transfers.ts` — transfer line picks a `variant_id` via stock row.
- `src/server/functions/shop/sales.ts` — sale line picks a `variant_id` via shop_stock row.
- `src/server/functions/admin/opening-balance.ts` — accepts `variant_id` rows.
- `src/server/functions/notifications/*` — threshold overrides + alerts + restock requisitions move to `variant_id`.

### Routes / pages touched
- `src/routes/products/index.tsx` → `src/routes/items/index.tsx` (route + file rename; redirect from `/products` → `/items` kept in router for 90 days)
- `src/routes/products/$articleNumber.tsx` → `src/routes/items/$articleNumber.tsx`
- `src/routes/settings/categories.tsx` — new admin page: list / create / rename / delete item categories, plus bulk-assign existing items to categories. (Route slug kept short — UI is unambiguous since users don't see transaction-side categories as a separate concept.)
- `src/routes/store/index.tsx`, `src/routes/shop/index.tsx` — stock list joins through variant.
- Item detail page gains a Variant subsection.

### InfoTip / help dictionary
- Add: `category.name`, `variant.barcode`, `variant.image`, `item.category` (per the info-tip policy: every form field, table header, and KPI card needs an InfoTip).
- Repoint: `articleNumber` tip text (now talks about Item).

### Permissions
- Add `itemCategories.manage` (admin only).
- Keep `products.view` / `products.manage` (effectively items now); add aliases or rename to `items.*`.

## 7. Code surface — Phase 2 (rename)

Mechanical replacement across:
- `src/db/schema/*` — table names, relation names, file names where relevant (`sales.ts`, `transfers.ts`, etc. keep their file names; only exported symbols rename).
- `src/server/functions/**` — every reference to `supplyRouteItems`, `shopSaleItems`, `storeTransferItems`, `stockTakeItems`, `shopReturnItems`, `storeReturnItems`.
- React Query keys, route loaders, form schemas, Drizzle queries.
- Cypress fixtures and assertions.
- TypeScript types exported from schema files.

UI copy that says "items" in human-language sense ("transfer dispatched with 3 items", "cart has 3 items") is left alone — it still reads correctly because in those contexts an "item" is a thing being moved/sold, which conceptually fits "Item = SKU" anyway.

## 8. Testing

### Phase 1
- **Cypress** — extend the golden-path E2E to: create a Category, create an Item with the new flow, assert auto-generated variants, post a supply receipt against a variant, sell the variant, transfer to shop, return.
- **Unit** — migration backfill is tested via a pgTAP-style fixture or a temp-db spin-up that loads a snapshot of pre-migration data and asserts post-migration row counts.
- **Drizzle schema diff** — ensure no orphaned indexes / constraint names after rename.

### Phase 2
- **Static checks** — grep for `supplyRouteItems`, `shopSaleItems`, etc. in non-`.sql` files; expect zero matches after rename.
- Run the existing test suite as-is; any reference to old names produces a compile error.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Variant rows generated for declared sizes that never had stock leave noise in admin UI | Admin variant list shows "in stock" badge; "delete unused" bulk action filters by `NOT EXISTS (SELECT 1 FROM stock WHERE variant_id = v.id)`. |
| Pre-flight assertions catch real-world dirty data only when migration runs | Run the pre-flight `SELECT`s against production-like data in staging before merging the migration PR. |
| `low_stock_alerts` / `restock_requisitions` don’t carry a size today | Backfill uses the alert/requisition’s implicit size derived from its stock-row source. If ambiguous, abort and clean before merge. |
| Two-phase split leaves the codebase briefly in an inconsistent vocabulary (`shopSaleItems.variantId`) | Phase 2 is queued immediately after Phase 1 lands; the awkward state is days, not weeks. |
| Existing route URLs `/products/*` shared in bookmarks / WhatsApp links | Keep `/products` → `/items` redirect (Phase 1 router) for 90 days. |
| Supply route lines in aggregate/color-only mode have no variant_id yet | Behavior unchanged — receiving still resolves them; variant is created on receipt. |

## 10. Out of scope

- Per-variant pricing.
- Multi-image gallery per variant.
- Generic option/value model (color/size only).
- Category hierarchy / category images / category-level permissions.
- Renaming user-facing UI copy that uses "items" in the line-count sense.
- Backfilling historical audit-log `entityType` strings.
- Sizes table (sizes remain plain text per D5).

## 11. Implementation slicing (preview)

To be expanded by the next-step planner. Likely shape:

**Phase 1**
1. Add `item_categories` table + admin page (list/create/rename/delete) + InfoTips.
2. Add `variants` table; backfill from existing colors × sizes.
3. Rename `products` → `items`, `product_colors` → `item_colors` (table + column renames; update Drizzle).
4. Add `items.item_category_id`; default to Uncategorized; expose category picker on item create/edit.
5. Swap stock/notification tables to `variant_id`; drop old columns.
6. Refactor server functions (receiving, transfers, sales, opening-balance) to operate on `variant_id`.
7. Update stock-list UIs to display per-variant counts.
8. Drop `items.sizes`.
9. Cypress golden-path coverage.

**Phase 2**
10. Rename all transaction `*_items` tables to `*_lines`; rename Drizzle symbols; cascade through server functions, routes, React Query keys, and Cypress.
11. Repoint audit-log emission to new entity names.

Detailed task breakdown handed to the kanban workflow (`/kanban`) — each phase becomes a kanban issue (or set of issues if Phase 1 is decomposed further during planning).
