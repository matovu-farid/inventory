# Variant flexibility — items are primary, variants are optional refinements

**Date:** 2026-05-31
**Status:** Draft, awaiting user review
**Supersedes (partially):** the variant-required model established by
`2026-05-24-category-item-variant-design.md` (variants stay first-class but
are no longer required to land stock).

## Background and motivation

Today the system treats `(item, color, size)` — a `variant` — as the
indivisible unit of stock. `storeStock`, `shopStock`, `saleLines`,
`transfers`, `returns`, and `notifications` are all keyed on
`variant_id NOT NULL`. The receiving flow refuses to accept a supply route
line that does not yet have both `color_id` and `size`:

```ts
// src/server/functions/store/receiving.ts:193
if (!itemColor || !sriSize || !sriColorId) {
  throw new Error(
    `Item ${sri.id} is missing color or size — split it into full variants before receiving`,
  )
}
```

The receiving page (`src/routes/store/receiving.tsx:100-211`) mirrors this
by filtering unresolved lines out of the table and surfacing an amber
"go back to the supply route and split" banner.

In practice, the user (a clothing-import business) often doesn't know the
color/size breakdown until items are unpacked at the store, or sometimes
not until they're sold. The current model forces a premature labelling
step and creates a hard blocker on the receiving page.

The new operating principle:

> The basic unit is the **item** and the **price it was bought at**.
> Variants are additional information and categorization. They don't
> determine price. The user can be more specific about variants at any
> stage in the app.

This spec is a single coherent change that pushes that principle through
catalog, supply, receiving, stock, sales, transfers, alerts, accounting,
and audit. The app is still in development, so test data can be dropped —
there is no migration path to preserve.

## Goals

- Items can exist without any colors or variants.
- Supply route lines can be received as aggregate (no color/size),
  color-only, or fully resolved — the choice is made any time.
- Stock can sit "unresolved" (no variant) for as long as the user wants.
- The user can "specify" some or all of an unresolved lot into proper
  variants at any time, from receiving, stock list, item detail, or
  anywhere unresolved stock appears.
- Sales and transfers can be performed against either the item (no
  variant) or a specific variant.
- Low-stock alerts and the minimum sell price are item-level concepts.
- The receiving page no longer blocks on missing color/size.

## Non-goals

- Un-specifying (variant → unresolved) — deferred.
- Schema migration of production data — there is no production data.
- Removing variants as a concept; they remain a first-class refinement.

## Data model (Approach 1 — nullable `variant_id` + denormalized `item_id`)

### `items`

Add:

| Column | Type | Notes |
|---|---|---|
| `minimum_sell_price_ugx` | `numeric NOT NULL DEFAULT 0` | Moved from `store_stock`. Item-wide floor; below-minimum-reason rule fires against this. |
| `low_stock_threshold` | `integer NULL` | Null = no alert. Alert fires when total on-hand at a location < threshold. |

`category text NOT NULL` is unchanged.

### `variants`

Structurally unchanged: `(item_id, color_id NOT NULL, size NOT NULL)`,
unique `(item_id, color_id, size)`. Items with zero variants are valid.

### `store_stock`, `shop_stock`

| Change | Detail |
|---|---|
| Add `item_id uuid NOT NULL` | FK to `items`, denormalized for fast item-level aggregation. |
| `variant_id` becomes `NULL` | `NULL` = unresolved lot. |
| Drop `minimum_sell_price_ugx` | Moved to `items`. |
| Replace unique key | Was `UNIQUE(store_id, variant_id)`. Now `UNIQUE NULLS NOT DISTINCT (store_id, item_id, variant_id, supply_route_line_id)`. |
| `cost_per_unit_ugx` | Unchanged — stays per stock row (lot-specific). |

By default Postgres treats `NULL` as distinct in unique constraints,
which would allow multiple unresolved rows per `(store, item,
supply_line)` — the opposite of what we want. Postgres 15+ supports
`UNIQUE NULLS NOT DISTINCT`, which treats NULL as equal for the purpose
of the constraint. Confirm the deployment target is on Postgres ≥ 15
during implementation (Neon supports it). If it isn't, fall back to a
pair of partial indexes:

```sql
CREATE UNIQUE INDEX uq_store_stock_resolved
  ON store_stock (store_id, item_id, variant_id, supply_route_line_id)
  WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX uq_store_stock_unresolved
  ON store_stock (store_id, item_id, supply_route_line_id)
  WHERE variant_id IS NULL;
```

The same shape applies to `shop_stock` (`shop_id` instead of `store_id`).

### `sale_lines`, `return_lines`

Add `item_id uuid NOT NULL`. Change `variant_id` to `NULL`. A sale of an
unresolved unit stores `(item_id, variant_id = NULL)`. A sale of a
specified variant stores both.

### `transfer_lines`

Add `item_id uuid NOT NULL`. Change `variant_id` to `NULL`. Same semantics
as sale lines.

### `low_stock_alerts`, `restock_requisitions`

Switch to `item_id NOT NULL`, drop `variant_id` entirely. Alerts are
item-level.

### `notification_threshold_overrides`

Repurpose to per-`(item_id, location_id)` overrides. Drop the variant
scope.

### Stock-takes

`stock_takes` and `stock_take_lines` follow the same `item_id NOT NULL`,
`variant_id NULL` pattern. Open question flagged below.

## UX changes by surface

### Item editor (create dialog + detail page)

- New required field: **Minimum sell price (UGX)**. Item-level. Default
  surfaced as 0 but the create dialog nudges the user to set it.
- New optional field: **Low-stock threshold** (integer). Empty = no alert.
- Colors and variants stay optional. Helper copy:
  *"Optional. Add colors if you want to track stock by color. You can
  also add them later from this page or while receiving."*
- Item detail page gains a summary line:
  *"Total on hand: 9 (4 unresolved · 5 across 2 variants)"*.
- "Specify variants" button visible on the item detail page whenever
  any unresolved stock exists for the item at any location. Opens the
  shared Specify dialog.
- Help-dictionary entries to add (per the info-tip policy):
  `item.minSellPrice`, `item.lowStockThreshold`, `item.variantsOptional`,
  `col.unresolved`.

### Supply route page (`/supply/$routeId`)

- No structural changes. The existing "Split into variants" button is
  retained — splitting pre-receipt is still useful but no longer
  required.
- Add helper text on aggregate lines:
  *"You can split now, while receiving, or after items land in stock."*

### Receiving page (`/store/receiving`)

- Drop the amber "N items still need a color and size" banner
  (`receiving.tsx:204-211`).
- Drop the `flatMap` filter that hides unresolved lines
  (`receiving.tsx:100-113`).
- Render every unreceived supply line in the table. New "Variant" column
  displays one of:
  - `Burgundy · M` (fully resolved)
  - `Burgundy · —` (color-only)
  - italic `Unresolved` (aggregate)
- Action group on the right of any not-fully-resolved row:
  - **Split** — opens the existing `SplitItemForm` dialog (extracted from
    `supply/$routeId.tsx` into a shared component). After save, replace
    the row in place with the resulting variant rows.
  - **Receive as-is** — no separate button; the user just types into the
    "Received" qty cell and submits. Lands as unresolved stock.
- Discrepancy dialog continues to work; it labels unresolved lines with
  the item name and an italic *Unresolved* tag.

### Receiving server function (`receiveGoods`)

- Remove the hard error at `receiving.ts:193-197`.
- For each supply line:
  - If both `color_id` and `size` present → resolve/create the variant as
    today, create a stock row with `variant_id` set + denormalized
    `item_id`.
  - Otherwise → create a stock row with `variant_id = NULL` and
    `item_id` derived from `sri.itemColor?.item_id ?? sri.item_id`
    (supply route lines already carry enough to resolve `item_id`).
- Upsert key changes from `(store_id, variant_id)` to
  `(store_id, item_id, variant_id, supply_route_line_id)` so the same
  supply lot always merges into one row.
- Ledger entries unchanged in shape; description string says
  *"Received N× {item.name} (unresolved)"* when no variant is set.

### Stock list pages (`/store/stock`, shop equivalent)

- Default grouping: **one row per item**. Collapsed row shows: name,
  article #, category, total qty across all variants + unresolved,
  item-level min sell price, low-stock badge if applicable.
- Expanded row shows one sub-row per `(variant_id|null,
  supply_route_line_id)` so per-lot cost and source route stay visible.
- Sub-row label: `Burgundy · M`, `Burgundy · —`, or italic `Unresolved`.
- Every sub-row with `variant_id = NULL` shows a **Specify** button
  (admins only).

### Specify dialog (shared component)

New component, used from stock list, item detail, and anywhere
unresolved stock surfaces.

- Header: *"Specify variants for {article #} — {N} unresolved"*.
- One row per specification: color combobox (existing item colors +
  "Add new color"), size input, qty.
- Running tally: *"{specified} of {total} specified — {remaining} stays
  unresolved"*.
- Allow specifying less than the total (partial allowed per user
  decision).
- Server fn `specifyStock` (`src/server/functions/store/specify.ts` for
  store stock; matching `shop/specify.ts` for shop stock):
  - Validates `sum(specified) ≤ source.qty`.
  - Transaction:
    1. For each specified variant: resolve-or-create the variant under
       `(item_id, color_id, size)`.
    2. Upsert into `*_stock` keyed by `(location_id, item_id, variant_id,
       supply_route_line_id)`. Inherit `cost_per_unit_ugx` from the
       source row.
    3. Decrement the source unresolved row by the total specified. If it
       hits 0, delete it.
    4. Write audit log entry `stock.specify` with metadata
       `{itemId, supplyRouteLineId, lines, remainingUnresolved}`.
  - No ledger entries — relabeling within the same lot is not a value
    movement.

### Shop POS (`/shop/sale` or equivalent)

- Search lists items as the primary unit, with name, article #, total
  on-hand, min sell price.
- Two add-to-cart paths:
  - **Tap the item row** → adds line `(item_id, variant_id = NULL)`,
    qty 1.
  - **Tap a variant chip** (only shown for items with variants) → adds
    line with the specific `variant_id`.
- Per-line qty stepper and price override remain. Below-minimum-reason
  rule (from [[client_decisions]] 2026-05-08) now fires against the
  item's `minimum_sell_price_ugx`.

### Sale persistence & stock decrement

- Sale line: `(item_id NOT NULL, variant_id NULL, qty, unit_price,
  below_minimum_reason?)`.
- Decrement order on submit:
  - If `variant_id` set → FIFO across that variant's stock rows by
    supply line age.
  - If `variant_id NULL` → FIFO across the item's stock rows, **unresolved
    lots first**, then variant lots, oldest supply line first within
    each group.
- Each decrement records `(sale_line_id, source_stock_id, qty)` in a
  `sale_line_allocations` table so returns and COGS can trace back to
  the correct lot. (Confirm during implementation whether an equivalent
  table exists — if not, add it.)

### Returns

- Return lines mirror sale lines: `item_id NOT NULL`, `variant_id NULL`.
- Return reverses the allocations: qty goes back to the same stock rows
  it was decremented from.

### Transfers (Store ↔ Shop)

- Transfer line: `(item_id NOT NULL, variant_id NULL, qty)`.
- Picker mirrors the POS: pick item, optionally pick a specific variant
  lot.
- Decrement source FIFO (unresolved first, then variants, oldest supply
  line first within each).
- Upsert destination stock rows keyed by `(location_id, item_id,
  variant_id, supply_route_line_id)`. `supply_route_line_id` carries
  across so cost provenance is preserved on the receiving side.

### Low-stock alerts

- `low_stock_alerts` and `restock_requisitions` become item-keyed
  (`item_id NOT NULL`, no `variant_id`).
- Alert fires when
  `SUM(qty) FROM *_stock WHERE item_id = X AND location_id = Y
   < items.low_stock_threshold`.
- `notification_threshold_overrides` repurposed to `(item_id,
  location_id)`.
- Notification job rewritten to group by item.

### Accounting

- Ledger entry shape unchanged. `Inventory - Store` / `Inventory - Shop`
  balances are still `Σ qty × cost_per_unit_ugx` across all stock rows,
  resolved or not.
- Reference IDs continue to point at supply lines, sales, and transfers.
- Description strings carry either `(Burgundy/M)` or `(unresolved)`.
- No new GL accounts.

### Audit log

- New action `stock.specify` — metadata `{itemId, supplyRouteLineId,
  lines: [{colorName, size, qty}], remainingUnresolved}`. Article numbers
  resolved from item.
- Existing actions (`store.receiveGoods`, `shop.recordSale`, etc.) —
  line metadata becomes `{itemId, variantId|null, colorName?, size?,
  qty}`. The denormalized `articleNumbers` summary stays for
  backwards-compatible querying.

## Removed / deprecated

- `store_stock.minimum_sell_price_ugx` column (moved to `items`).
- `setMinimumSellPrice` server fn (replaced by item-level
  `setItemMinimumSellPrice`).
- Receiving page amber "split before receiving" banner.
- Hard error in `receiveGoods` for unresolved lines.
- Per-variant low-stock thresholds.

## Implementation order (high-level)

1. Schema: add `items.minimum_sell_price_ugx`,
   `items.low_stock_threshold`. Add `item_id` to stock/sale/transfer/
   alert tables. Make `variant_id` nullable on those tables. Rewrite
   uniqueness constraints. Drop `store_stock.minimum_sell_price_ugx`.
   Drop dev data.
2. Extract `SplitItemForm` from `supply/$routeId.tsx` into a shared
   component.
3. Update `receiveGoods` to handle unresolved lines.
4. Update receiving page UI: drop banner, drop filter, add Split button
   in the row.
5. Build `specifyStock` server fn + shared Specify dialog.
6. Update stock list pages to group-by-item with expandable variant
   breakdown and Specify buttons.
7. Update item editor to expose min sell price + low-stock threshold and
   keep colors/variants optional with clearer copy.
8. Update POS to allow item-level add-to-cart with FIFO unresolved-first
   decrement.
9. Update transfers picker and decrement order.
10. Rewrite low-stock notification job and threshold-override semantics.
11. Update audit log metadata and renderers.
12. Sweep tests; rewrite the variant-required tests that no longer apply.

## Open questions

- **Stock-takes** — confirm during implementation whether they should
  also become `item_id NOT NULL`, `variant_id NULL`. Likely yes; same
  pattern.
- **Barcodes** — currently per-variant (`variants.barcode`). For
  unresolved POS scan, no barcode resolves → user picks the item
  manually. No change required, but worth a note in user docs.
- **Un-specifying** (variant → unresolved) — deferred to a future
  iteration.

## Risks

- **Surface area.** This touches catalog, supply, receiving, stock,
  sales, transfers, returns, alerts, accounting, audit, and the related
  UI surfaces. Mitigation: the development-phase data dump removes
  migration risk and lets the schema change land in one commit, but the
  test sweep and UI work are still meaningful.
- **FIFO complexity.** Unresolved-first FIFO is a new ordering rule.
  Mitigation: encapsulate in a single helper, cover with unit tests.
- **Audit denormalization.** `articleNumbers` summary continues to
  work, but variant-less lines need careful handling so reports don't
  show blank cells.

## References

- Current variant model:
  `docs/superpowers/specs/2026-05-24-category-item-variant-design.md`
- Item categories (free text):
  `docs/superpowers/specs/2026-05-31-items-free-text-category-design.md`
- Receiving server fn: `src/server/functions/store/receiving.ts`
- Receiving page: `src/routes/store/receiving.tsx`
- Supply route page (Split dialog source):
  `src/routes/supply/$routeId.tsx`
- Variant schema: `src/db/schema/variants.ts`
- Item schema: `src/db/schema/items.ts`
- Stock schema: `src/db/schema/store.ts`, `src/db/schema/shops.ts`
- Notifications schema: `src/db/schema/notifications.ts`
- Below-minimum-reason policy: [[client_decisions]] (2026-05-08
  reversal)
- Info-tip policy: [[feedback_info_tips]]
- UGX rounding: [[project_ugx_rounding]]
