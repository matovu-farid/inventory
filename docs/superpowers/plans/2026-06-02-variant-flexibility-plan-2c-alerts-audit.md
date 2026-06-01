# Variant Flexibility — Plan 2c: Alerts + Audit Metadata Reshape

> Successor to Plan 2b. Final phase of the variant-flexibility rollout.

**Goal:** Make low-stock alerts, restock requisitions, and notification threshold overrides item-keyed (not variant-keyed). Reshape sale/transfer/return audit `lines: [...]` metadata to the unified `{itemId, variantId|null, colorName?, size?, qty}` shape. Fix `startStockTake` audit description hardcoded `itemCount: 0`. Drop the legacy `shopStockItem` relations on sale/return line tables.

**Architecture:** Same Approach 1 as Plans 1, 2a, 2b. Item is the primary unit; variant is optional. Low-stock alerts track "total on-hand for this item at this location dropped below the threshold" — across resolved + unresolved lots. Restock requisitions become "this item needs more stock at this store"; their suggested quantity stays based on the item's baseline + threshold rule.

**Prerequisite:** Plans 1, 2a, 2b all merged.

---

## Phase 1 — Schema reshape

### Task 1: `low_stock_alerts` → item-keyed

- [ ] Add `item_id uuid NOT NULL → items.id`, drop the `variant_id` FK (replace with nullable `variant_id` for backwards-compat read paths; cleanup in Task 8).
- [ ] Rewrite the partial unique index from `(scope, location_id, variant_id) WHERE status='open'` to `(scope, location_id, item_id) WHERE status='open'`.
- [ ] Update relations: add `item: one(items, ...)`.

### Task 2: `restock_requisitions` → item-keyed

- [ ] Add `item_id uuid NOT NULL`, keep `variant_id` nullable for now.
- [ ] Rewrite partial unique index from `(store_id, variant_id) WHERE status='open'` to `(store_id, item_id) WHERE status='open'`.

### Task 3: `notification_threshold_overrides` → item-keyed

- [ ] Add `item_id uuid NOT NULL`, keep `variant_id` nullable.
- [ ] Rewrite uniqueness from `(scope, variant_id, shop_id)` to `(scope, item_id, shop_id)` (NULLS NOT DISTINCT on shop_id).

## Phase 2 — Notification job rewrite

### Task 4: `run-threshold-checks.ts` aggregates by item

- [ ] Group `store_stock` / `shop_stock` rows by `item_id` (sum of `quantityOnHand` per location). Threshold compares item-level totals.
- [ ] Override lookup keys on `(scope, item_id, locationId?)` (or `(scope, item_id, NULL)` for "all locations" override).
- [ ] Alert open/resolve check keys on `(scope, locationId, item_id)`.
- [ ] Notification body switches from per-variant label (`ABC Red / M`) to item-level (`ABC Polo · 3 units on hand`).

### Task 5: `restock-suggestions.ts` + `requisitions.ts` aggregates by item

- [ ] Suggestions return `{itemId, totalOnHand, baseline, suggested}` shape.
- [ ] Requisition writes use `itemId` instead of `variantId`.

## Phase 3 — Audit metadata reshape

### Task 6: Sale/transfer/return audit `lines: [...]` shape

Sites that write audit metadata containing per-line breakdowns:
- `recordSale` (`shop/sales.ts`) — currently doesn't write a `lines:` key; fine.
- `createTransfer` (`store/transfers.ts`) — writes `lines: [{...variant fields}]`.
- `confirmTransferReceipt` — similar.
- `dispatchStoreReturn` / `receiveStoreReturn` — similar (post-Plan-2b).
- `recordCustomerReturn` — similar.

- [ ] Each site that writes a `lines:` audit metadata key reshapes the per-line object to `{itemId, variantId|null, colorName?, size?, qty}`.
- [ ] `resolveArticleNumbersForAudit` re-examined — it walks line tables to items, which already works post-Plan-2b. Confirm no regressions.

### Task 7: `startStockTake` `itemCount: 0` description fix

- [ ] `startStockTake` description currently hardcodes `itemCount: 0`. The audit *metadata* already carries the real count; just thread it into `renderAuditDescription`.

## Phase 4 — Cleanups

### Task 8: Drop legacy `shopStockItem` relations on line tables

- [ ] `shopSaleLines.shopStockItem` — drop relation (no current readers).
- [ ] `shopReturnLines.shopStockItem` — drop.
- [ ] `storeReturnLines.shopStock` — drop.
- [ ] Drop the nullable `shop_stock_id` columns on the same three tables (they were retained for backwards-compat during Plan 2b; nothing writes them now and nothing reads them).

### Task 9: End-to-end test + memory update

- [ ] Smoke test: trip a low-stock alert by selling down to threshold; verify alert opens with `item_id` populated and resolves when receive brings the item back above threshold.
- [ ] Update `~/.claude/projects/.../memory/project_variant_flexibility.md` to mark Plan 2c shipped.

---

## Out of scope

- Touch POS `/pos` item-level rework. Plan 2b deferred this; the touch UI's variant-picker is variant-keyed by design. Tracked separately.
- Removing variants as a concept — they remain a first-class refinement.
