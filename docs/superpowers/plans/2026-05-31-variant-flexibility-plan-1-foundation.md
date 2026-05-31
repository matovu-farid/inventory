# Variant Flexibility — Plan 1: Foundation, Receiving, Stock & Specify

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema changes that make items the primary stock unit, unblock the Receiving page so it accepts unresolved (no color/size) supply lines, and add a "Specify" action that splits unresolved stock into variants at any time.

**Architecture:** Approach 1 from the spec — nullable `variant_id` + denormalized `item_id` on stock tables. `store_stock` keys on `(store_id, item_id, variant_id, supply_route_line_id)` with `UNIQUE NULLS NOT DISTINCT` (Neon Postgres 15+). Receiving accepts any supply line and writes a stock row with `variant_id` set or null depending on resolution. A new `specifyStock` server function splits an unresolved stock row into N variant-keyed rows + optional leftover. The existing `SplitItemForm` is extracted into a shared component reused on the receiving page.

**Tech Stack:** Drizzle ORM + Drizzle Kit (Postgres), TanStack Start server functions, TanStack Router, React + shadcn/ui, Vitest, BigNumber.js, Zod.

**Spec:** `docs/superpowers/specs/2026-05-31-variant-flexibility-design.md`

**Out of scope (Plan 2):** `shop_stock`, `sale_lines`, `transfer_lines`, `return_lines`, low-stock alerts/notifications, audit metadata reshape for sales/transfers, POS item-level add-to-cart. Those land in a separate plan after this one is executed.

---

## Pre-flight

- [ ] **Step 0.1:** Confirm `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass on `main` before starting.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 0.2:** Confirm the dev database is on Postgres 15+ (Neon default is 17). The schema relies on `UNIQUE NULLS NOT DISTINCT` (Postgres 15+).

```bash
psql "$DATABASE_URL" -c "SHOW server_version;"
```

Expected: `15.x` or higher.

- [ ] **Step 0.3:** Drop dev database state. The spec authorises wiping test data; this plan adds NOT NULL columns without defaults to stock tables, which requires an empty table.

```bash
pnpm db:push -- --force  # or drop + recreate via your Neon dashboard
pnpm db:seed              # re-seed minimal data
```

Expected: clean DB, seed succeeds.

---

## Phase 1 — Schema foundation

Adds item-level pricing/threshold fields, makes `store_stock.variant_id` nullable, denormalizes `item_id` onto `store_stock`, replaces the uniqueness key.

### Task 1: Add `minimum_sell_price_ugx` and `low_stock_threshold` to `items`

**Files:**
- Modify: `src/db/schema/items.ts`
- Test: `src/__tests__/items-schema-flexibility.test.ts` (create)

- [ ] **Step 1.1: Write the failing test**

```ts
// src/__tests__/items-schema-flexibility.test.ts
import { describe, it, expect } from "vitest"
import { items } from "#/db/schema/items"

describe("items schema — variant-flexibility fields", () => {
  it("has minimum_sell_price_ugx as NOT NULL numeric", () => {
    const col = items.minimumSellPriceUgx
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it("has low_stock_threshold as nullable integer", () => {
    const col = items.lowStockThreshold
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/items-schema-flexibility.test.ts
```

Expected: FAIL — `items.minimumSellPriceUgx` is `undefined`.

- [ ] **Step 1.3: Add columns to schema**

In `src/db/schema/items.ts`, add `numeric` and `integer` to the drizzle imports, then add two columns inside the `items` table definition after `category`:

```ts
  minimumSellPriceUgx: numeric("minimum_sell_price_ugx", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  lowStockThreshold: integer("low_stock_threshold"),
```

- [ ] **Step 1.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/items-schema-flexibility.test.ts
```

Expected: PASS.

- [ ] **Step 1.5: Generate migration**

```bash
pnpm db:generate
```

Expected: a new file `drizzle/0019_items_min_price_low_stock.sql` (or similar numbering) appears.

- [ ] **Step 1.6: Apply migration to dev and test DBs**

```bash
pnpm db:push:all
```

Expected: both databases get the two new columns; existing rows get `minimum_sell_price_ugx = 0` and `low_stock_threshold = NULL`.

- [ ] **Step 1.7: Commit**

```bash
git add src/db/schema/items.ts src/__tests__/items-schema-flexibility.test.ts drizzle/
git commit -m "feat(items): add item-level min sell price and low-stock threshold"
```

### Task 2: Denormalize `item_id` on `store_stock` and make `variant_id` nullable

**Files:**
- Modify: `src/db/schema/store.ts`
- Test: `src/__tests__/store-stock-schema-flexibility.test.ts` (create)

- [ ] **Step 2.1: Write the failing test**

```ts
// src/__tests__/store-stock-schema-flexibility.test.ts
import { describe, it, expect } from "vitest"
import { storeStock } from "#/db/schema/store"

describe("store_stock schema — variant-flexibility", () => {
  it("has item_id as NOT NULL uuid", () => {
    const col = storeStock.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it("variant_id is nullable", () => {
    const col = storeStock.variantId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("no longer has minimumSellPriceUgx column", () => {
    expect(
      (storeStock as unknown as Record<string, unknown>).minimumSellPriceUgx,
    ).toBeUndefined()
  })
})
```

- [ ] **Step 2.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/store-stock-schema-flexibility.test.ts
```

Expected: FAIL — `storeStock.itemId` is `undefined`, `variantId` is NOT NULL, `minimumSellPriceUgx` still present.

- [ ] **Step 2.3: Edit `src/db/schema/store.ts` to apply all three changes**

Replace the `storeStock` table definition with:

```ts
import { items } from "./items"

export const storeStock = pgTable(
  "store_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    supplyRouteLineId: uuid("supply_route_line_id").references(
      () => supplyRouteLines.id,
      { onDelete: "restrict" },
    ),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_ss_store").on(table.storeId),
    index("idx_ss_item").on(table.itemId),
    index("idx_ss_line").on(table.supplyRouteLineId),
    index("idx_ss_variant").on(table.variantId),
    // Replaces the old uq_ss_variant. Postgres 15+ NULLS NOT DISTINCT
    // means at most one (store, item, NULL variant, line) row.
    unique("uq_ss_store_item_variant_line", {
      nulls: "not distinct",
    }).on(table.storeId, table.itemId, table.variantId, table.supplyRouteLineId),
  ],
)
```

Add `import { items } from "./items"` at the top.

Update `storeStockRelations` to add an `item` relation:

```ts
export const storeStockRelations = relations(storeStock, ({ one }) => ({
  store: one(stores, {
    fields: [storeStock.storeId],
    references: [stores.id],
  }),
  item: one(items, {
    fields: [storeStock.itemId],
    references: [items.id],
  }),
  supplyRouteLine: one(supplyRouteLines, {
    fields: [storeStock.supplyRouteLineId],
    references: [supplyRouteLines.id],
  }),
  variant: one(variants, {
    fields: [storeStock.variantId],
    references: [variants.id],
  }),
}))
```

- [ ] **Step 2.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/store-stock-schema-flexibility.test.ts
```

Expected: PASS.

- [ ] **Step 2.5: Generate migration**

```bash
pnpm db:generate
```

Expected: a new migration drops `minimum_sell_price_ugx`, adds `item_id NOT NULL` and the new index, drops the old `uq_ss_variant`, and adds `uq_ss_store_item_variant_line` with `NULLS NOT DISTINCT`. Hand-inspect the SQL — if drizzle-kit emits `ADD COLUMN item_id ... NOT NULL` without a default, that will fail on a non-empty table. The dev DB is empty (Step 0.3), so this is fine; if it isn't, drop and re-push.

- [ ] **Step 2.6: Apply migration**

```bash
pnpm db:push:all
```

Expected: both DBs migrated cleanly.

- [ ] **Step 2.7: Commit**

```bash
git add src/db/schema/store.ts src/__tests__/store-stock-schema-flexibility.test.ts drizzle/
git commit -m "feat(stock): item_id denorm + nullable variant_id on store_stock"
```

### Task 3: Patch `setMinimumSellPrice` → `setItemMinimumSellPrice`

Server fn moves from store-stock-keyed to item-keyed.

**Files:**
- Modify: `src/server/functions/store/receiving.ts` (delete `setMinimumSellPrice`)
- Create: `src/server/functions/items/prices.ts` — actually already exists; modify it
- Test: `src/__tests__/set-item-minimum-sell-price.test.ts` (create)

- [ ] **Step 3.1: Read existing prices file**

```bash
cat src/server/functions/items/prices.ts
```

Expected: existing per-variant or per-stock pricing fns; note any reuse opportunity.

- [ ] **Step 3.2: Write the failing test**

```ts
// src/__tests__/set-item-minimum-sell-price.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { setItemMinimumSellPrice } from "#/server/functions/items/prices"
import { db } from "#/db"
import { items } from "#/db/schema"
import { eq } from "drizzle-orm"
import { resetTestDb, seedItem } from "./test-helpers"

describe("setItemMinimumSellPrice", () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it("updates the item's minimum_sell_price_ugx", async () => {
    const itemId = await seedItem({ articleNumber: "TR-X", name: "Tee" })
    await setItemMinimumSellPrice({
      data: { itemId, minimumSellPriceUgx: "12500.00" },
    })
    const row = await db.query.items.findFirst({ where: eq(items.id, itemId) })
    expect(row?.minimumSellPriceUgx).toBe("12500.00")
  })

  it("throws if item does not exist", async () => {
    await expect(
      setItemMinimumSellPrice({
        data: {
          itemId: "00000000-0000-0000-0000-000000000000",
          minimumSellPriceUgx: "0",
        },
      }),
    ).rejects.toThrow()
  })
})
```

If `seedItem` and `resetTestDb` don't already exist in `test-helpers.ts`, add them (small helpers that wrap `db.delete(...)` and `db.insert(items).values(...).returning()`).

- [ ] **Step 3.3: Run the test to verify it fails**

```bash
pnpm test src/__tests__/set-item-minimum-sell-price.test.ts
```

Expected: FAIL — `setItemMinimumSellPrice` not exported.

- [ ] **Step 3.4: Implement**

In `src/server/functions/items/prices.ts`, add:

```ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "#/db"
import { items } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const setItemMinPriceInput = z.object({
  itemId: z.uuid(),
  minimumSellPriceUgx: z.string(),
})

export const setItemMinimumSellPrice = createServerFn()
  .inputValidator(setItemMinPriceInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const updated = (
      await db
        .update(items)
        .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
        .where(eq(items.id, data.itemId))
        .returning()
    ).at(0)
    if (!updated) throw new Error("Item not found")
    return updated
  })
```

- [ ] **Step 3.5: Remove the old per-stock-row server fn**

Delete the `setMinimumSellPrice` export from `src/server/functions/store/receiving.ts` (lines ~409-428) and the `setMinPriceInput` zod schema. Search the repo for callers:

```bash
grep -rn "setMinimumSellPrice" src/
```

Update every caller (likely on `store/stock` page and item detail page) to call `setItemMinimumSellPrice` with `itemId`. Update each caller's test if any exists.

- [ ] **Step 3.6: Run all tests, typecheck, and lint**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. The new test passes; no old caller still references `setMinimumSellPrice`.

- [ ] **Step 3.7: Commit**

```bash
git add -A
git commit -m "feat(items): move minimum sell price from store_stock to items"
```

---

## Phase 2 — Item editor surfaces item-level price + threshold

Items grow two new fields. Catalog UI exposes them.

### Task 4: Item editor form — add fields

**Files:**
- Modify: `src/components/items/item-editor.tsx` (canonical editor; if path differs, use the one referenced by `src/routes/items/$articleNumber.tsx` and `src/routes/items/index.tsx`)
- Modify: `src/server/functions/items/items.ts` (createItem / updateItem inputs)
- Modify: `src/lib/help-dictionary.ts`
- Test: `src/__tests__/items-create-with-min-price.test.ts` (create)

- [ ] **Step 4.1: Read the current editor and items server fns**

```bash
grep -rn "createItem\|updateItem" src/server/functions/items/items.ts | head -20
```

Expected: locate the existing zod input schemas and DB writes.

- [ ] **Step 4.2: Write the failing test**

```ts
// src/__tests__/items-create-with-min-price.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { createItem } from "#/server/functions/items/items"
import { db } from "#/db"
import { items } from "#/db/schema"
import { eq } from "drizzle-orm"
import { resetTestDb } from "./test-helpers"

describe("createItem — variant-flexibility fields", () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it("persists minimumSellPriceUgx and lowStockThreshold", async () => {
    const created = await createItem({
      data: {
        articleNumber: "TR-MIN",
        name: "Min Test",
        category: "Tops",
        minimumSellPriceUgx: "9500.00",
        lowStockThreshold: 5,
      },
    })
    const row = await db.query.items.findFirst({
      where: eq(items.id, created.id),
    })
    expect(row?.minimumSellPriceUgx).toBe("9500.00")
    expect(row?.lowStockThreshold).toBe(5)
  })

  it("defaults minimumSellPriceUgx to 0 and lowStockThreshold to null", async () => {
    const created = await createItem({
      data: {
        articleNumber: "TR-DEF",
        name: "Default Test",
        category: "Tops",
      },
    })
    const row = await db.query.items.findFirst({
      where: eq(items.id, created.id),
    })
    expect(row?.minimumSellPriceUgx).toBe("0.00")
    expect(row?.lowStockThreshold).toBeNull()
  })
})
```

- [ ] **Step 4.3: Run the test to verify it fails**

```bash
pnpm test src/__tests__/items-create-with-min-price.test.ts
```

Expected: FAIL — input schema rejects unknown keys.

- [ ] **Step 4.4: Update `createItem` and `updateItem` zod inputs**

In `src/server/functions/items/items.ts`, locate the input schemas for `createItem` and `updateItem`. Add two optional fields to both:

```ts
  minimumSellPriceUgx: z.string().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
```

In the create handler, when inserting into `items`, pass through:

```ts
  minimumSellPriceUgx: data.minimumSellPriceUgx ?? "0",
  lowStockThreshold: data.lowStockThreshold ?? null,
```

In the update handler, only overwrite when the key is present in `data` (treat undefined as "no change", null as "clear threshold").

- [ ] **Step 4.5: Run the test to verify it passes**

```bash
pnpm test src/__tests__/items-create-with-min-price.test.ts
```

Expected: PASS.

- [ ] **Step 4.6: Add UI fields to `item-editor.tsx`**

Locate the form section that renders the `category` field. Add two siblings:

```tsx
<div className="space-y-2">
  <FieldLabel help="item.minSellPrice">
    Minimum sell price (UGX)
  </FieldLabel>
  <MoneyInput
    value={form.values.minimumSellPriceUgx ?? "0"}
    onChange={(v) => form.setFieldValue("minimumSellPriceUgx", v)}
    currency="UGX"
  />
</div>

<div className="space-y-2">
  <FieldLabel help="item.lowStockThreshold">
    Low-stock threshold
  </FieldLabel>
  <Input
    type="number"
    min={0}
    step={1}
    placeholder="No alert"
    value={form.values.lowStockThreshold ?? ""}
    onChange={(e) => {
      const v = e.target.value
      form.setFieldValue(
        "lowStockThreshold",
        v === "" ? null : Math.max(0, Math.floor(Number(v))),
      )
    }}
  />
</div>
```

Wire `form.values` initial state from the loader / props with the same fallbacks (`"0"`, `null`).

- [ ] **Step 4.7: Add help dictionary entries**

In `src/lib/help-dictionary.ts`, add (slot under the existing `item.*` section):

```ts
  "item.minSellPrice": {
    title: "Minimum sell price",
    body:
      "Floor price for this item across every variant and unresolved stock. " +
      "Cashiers selling below this price must record a reason.",
  },
  "item.lowStockThreshold": {
    title: "Low-stock threshold",
    body:
      "When total on-hand for this item at a location drops below this number, " +
      "a low-stock alert fires. Leave blank to disable alerts for this item.",
  },
  "item.variantsOptional": {
    title: "Variants are optional",
    body:
      "Colors and sizes are refinements. You can add them now, while receiving, " +
      "or after items land in stock. Stock without variants is called 'unresolved'.",
  },
  "col.unresolved": {
    title: "Unresolved",
    body:
      "Stock that hasn't been labelled with a specific color and size yet. " +
      "Use the Specify button to break it into proper variants any time.",
  },
```

- [ ] **Step 4.8: Run lint, typecheck, full tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 4.9: Commit**

```bash
git add -A
git commit -m "feat(items): item editor exposes min sell price + low-stock threshold"
```

### Task 5: Item editor — colors/variants stay optional, copy update

**Files:**
- Modify: `src/components/items/item-editor.tsx`

- [ ] **Step 5.1: Confirm colors are not required**

Search the editor for any "must have at least one color" client-side guard. There likely isn't one, but the submit button may be disabled until a color is present.

```bash
grep -n "color" src/components/items/item-editor.tsx | head -30
```

- [ ] **Step 5.2: Remove any color-required guard**

If you find one, replace the disabling condition with the variant-flexibility copy and let the submit proceed without colors. Use existing form helpers; don't disable on empty colors.

- [ ] **Step 5.3: Update the Colors section helper copy**

Replace any existing helper text under the "Colors" sub-heading with:

```tsx
<p className="text-sm text-muted-foreground">
  Optional. Add colors if you want to track stock by color. You can also
  add them later from this page or while receiving. <InfoTip term="item.variantsOptional" />
</p>
```

- [ ] **Step 5.4: Manually verify in dev**

```bash
pnpm dev
```

Visit `localhost:3000/items` → New item. Confirm you can create an item with no colors and a category. The item appears in the items list.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/items/item-editor.tsx
git commit -m "feat(items): clarify colors are optional in item editor copy"
```

---

## Phase 3 — Extract `SplitItemForm` into a shared component

Currently lives inside `src/routes/supply/$routeId.tsx` (lines 632-822). We need to use it from the receiving page too.

### Task 6: Extract `SplitItemForm`

**Files:**
- Create: `src/components/supply/split-item-form.tsx`
- Modify: `src/routes/supply/$routeId.tsx`

- [ ] **Step 6.1: Read the current implementation**

```bash
sed -n '632,822p' src/routes/supply/$routeId.tsx
```

Expected: see the form + its internal helpers (`ColorQuantityList`, `VariantGrid`, `deriveSizes`, `SplittableItem` type).

- [ ] **Step 6.2: Create the new file**

```tsx
// src/components/supply/split-item-form.tsx
import React, { useState } from "react"
import { Button } from "#/components/ui/button"
import { FieldLabel } from "#/components/ui/field-label"
import { Input } from "#/components/ui/input"
import { getItemByArticle } from "#/server/functions/items/items"
import { splitSupplyRouteItem } from "#/server/functions/supply/items"
import { deriveSizes } from "#/lib/derive-sizes"
import type { ItemSummary } from "#/server/functions/items/items"

export interface SplittableItem {
  id: string
  quantity: number
  product?: { articleNumber: string; name: string } | null
  itemColor?: {
    id: string
    colorName: string
    colorHex: string
    item: { articleNumber: string; name: string }
  } | null
  size: string | null
}

export function SplitItemForm({
  item,
  onSuccess,
}: {
  item: SplittableItem
  onSuccess: () => void
}) {
  /* ... paste body of existing SplitItemForm from supply/$routeId.tsx unchanged ... */
}

/* Paste ColorQuantityList and VariantGrid here too if they aren't already shared. */
```

Move `ColorQuantityList`, `VariantGrid`, and any other private helpers from `supply/$routeId.tsx` into the same file (or split into `src/components/supply/_split-helpers.tsx`). If `deriveSizes` already lives in `src/lib/derive-sizes.ts`, import it; otherwise leave inline. Keep behavior 100% identical.

- [ ] **Step 6.3: Update `supply/$routeId.tsx` to import**

In `src/routes/supply/$routeId.tsx`:

1. Remove the inline `SplitItemForm`, `ColorQuantityList`, `VariantGrid`, and the `SplittableItem` interface (lines ~632-822 and any helper blocks that follow).
2. Add at the top of the file:

```ts
import { SplitItemForm } from "#/components/supply/split-item-form"
```

Confirm the dialog wiring at lines ~507-525 still compiles unchanged.

- [ ] **Step 6.4: Run typecheck, lint, and the supply tests**

```bash
pnpm typecheck && pnpm lint
pnpm test src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts
```

Expected: all green. Behavior is unchanged because the form moved verbatim.

- [ ] **Step 6.5: Manually verify in dev**

```bash
pnpm dev
```

Visit a supply route, click "Split" on an aggregate item, confirm the dialog still opens and saving still works.

- [ ] **Step 6.6: Commit**

```bash
git add -A
git commit -m "refactor(supply): extract SplitItemForm into shared component"
```

---

## Phase 4 — `receiveGoods` accepts unresolved supply lines

Drops the hard error; persists stock with `variant_id = null` when color/size aren't both set.

### Task 7: Drop the unresolved hard error and persist with `item_id`

**Files:**
- Modify: `src/server/functions/store/receiving.ts`
- Test: `src/__tests__/receive-unresolved.test.ts` (create)

- [ ] **Step 7.1: Re-read the current handler**

```bash
sed -n '180,290p' src/server/functions/store/receiving.ts
```

Note where the hard error lives (~line 193-197) and where `storeStock` is upserted (~line 264-281).

- [ ] **Step 7.2: Write the failing test — aggregate line lands as unresolved stock**

```ts
// src/__tests__/receive-unresolved.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { storeStock } from "#/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { receiveGoods } from "#/server/functions/store/receiving"
import {
  resetTestDb,
  seedItem,
  seedSupplier,
  seedSupplyRouteWithAggregateLine,
  seedStore,
  loginAsAdmin,
} from "./test-helpers"

describe("receiveGoods — unresolved lines", () => {
  beforeEach(async () => {
    await resetTestDb()
    await loginAsAdmin()
  })

  it("creates a store_stock row with variant_id NULL and itemId set", async () => {
    const itemId = await seedItem({ articleNumber: "AGG-1", name: "Polo" })
    const supplierId = await seedSupplier({ name: "Acme" })
    const { routeId, lineId } = await seedSupplyRouteWithAggregateLine({
      itemId,
      supplierId,
      quantity: 9,
      unitPriceForeign: "49.00",
    })
    const storeId = await seedStore()

    await receiveGoods({
      data: {
        supplyRouteId: routeId,
        items: [{ supplyRouteLineId: lineId, quantityReceived: 9 }],
      },
    })

    const rows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.itemId, itemId),
        eq(storeStock.storeId, storeId),
        isNull(storeStock.variantId),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(9)
  })
})
```

`seedSupplyRouteWithAggregateLine` is a new helper — add it in `test-helpers.ts` to insert a `supply_routes` row + a `supply_route_lines` row with `itemId` set (or however the schema models aggregate lines today) and return both IDs.

- [ ] **Step 7.3: Run the test to verify it fails**

```bash
pnpm test src/__tests__/receive-unresolved.test.ts
```

Expected: FAIL — current handler throws `"missing color or size"`.

- [ ] **Step 7.4: Patch the handler**

In `src/server/functions/store/receiving.ts`, locate the block:

```ts
const itemColor = sri.itemColor
const sriSize = sri.size
const sriColorId = sri.colorId
if (!itemColor || !sriSize || !sriColorId) {
  throw new Error(
    `Item ${sri.id} is missing color or size — split it into full variants before receiving`,
  )
}
```

Replace with:

```ts
const itemColor = sri.itemColor
const sriSize = sri.size
const sriColorId = sri.colorId
const isResolved = Boolean(itemColor && sriSize && sriColorId)

// Resolve item_id for the stock row — works whether or not the line
// carries a fully-resolved variant.
const itemId = sri.itemColor?.itemId ?? sri.itemId
if (!itemId) {
  throw new Error(
    `Supply line ${sri.id} has no item — cannot receive`,
  )
}

let variantRow: { id: string } | null = null
if (isResolved) {
  variantRow = await tx.query.variants.findFirst({
    where: and(
      eq(variants.colorId, sriColorId!),
      eq(variants.size, sriSize!),
    ),
  }) ?? null
  if (!variantRow) {
    const [created] = await tx
      .insert(variants)
      .values({
        itemId,
        colorId: sriColorId!,
        size: sriSize!,
      })
      .returning()
    variantRow = created
  }
}
```

Update the `itemLabel` so it works for unresolved:

```ts
const itemLabel = isResolved
  ? formatItemLabel(
      itemColor!.item.articleNumber,
      itemColor!.colorName,
      sriSize!,
    )
  : `${sri.item?.articleNumber ?? "?"} (unresolved)`
```

(Confirm `sri.item` exists — if `supply_route_lines.itemId` is a direct FK to `items`, expose it on the relation. If not, add a separate `tx.query.items.findFirst({ where: eq(items.id, itemId) })`.)

Replace the upsert with one that keys on `(store_id, item_id, variant_id, supply_route_line_id)`:

```ts
if (item.quantityReceived > 0) {
  // Look up existing row; on the matching key. We can't use
  // onConflictDoUpdate with a NULL key cleanly, so do an explicit
  // find-then-insert-or-update.
  const existing = await tx.query.storeStock.findFirst({
    where: and(
      eq(storeStock.storeId, store.id),
      eq(storeStock.itemId, itemId),
      variantRow
        ? eq(storeStock.variantId, variantRow.id)
        : isNull(storeStock.variantId),
      sri.id
        ? eq(storeStock.supplyRouteLineId, sri.id)
        : isNull(storeStock.supplyRouteLineId),
    ),
  })

  if (existing) {
    await tx
      .update(storeStock)
      .set({
        quantityOnHand: sql`${storeStock.quantityOnHand} + ${item.quantityReceived}`,
      })
      .where(eq(storeStock.id, existing.id))
  } else {
    await tx.insert(storeStock).values({
      storeId: store.id,
      itemId,
      variantId: variantRow?.id ?? null,
      supplyRouteLineId: sri.id,
      quantityOnHand: item.quantityReceived,
      costPerUnitUgx: costPerUnit.toFixed(2),
    })
  }
}
```

Note: the `minimumSellPriceUgx` column on `storeStock` is gone (removed in Task 2), so don't write it.

For the audit lines, change the variantId field to nullable and add itemId + nullable color/size:

```ts
auditLines.push({
  supplyRouteLineId: sri.id,
  itemId,
  variantId: variantRow?.id ?? null,
  colorName: itemColor?.colorName ?? null,
  size: sriSize ?? null,
  quantityReceived: item.quantityReceived,
})
```

- [ ] **Step 7.5: Run the test to verify it passes**

```bash
pnpm test src/__tests__/receive-unresolved.test.ts
```

Expected: PASS.

- [ ] **Step 7.6: Add a test for the still-resolved happy path**

```ts
it("creates a variant-keyed store_stock row when color and size present", async () => {
  // ... seed an item with color + size + supply line that has both set ...
  // ... receive 5 ...
  // ... assert exactly one row with variantId set, quantityOnHand = 5 ...
})
```

Implement using the same helpers; if `seedSupplyRouteWithResolvedLine` doesn't exist, add it next to `seedSupplyRouteWithAggregateLine`.

Run:

```bash
pnpm test src/__tests__/receive-unresolved.test.ts
```

Expected: both tests PASS.

- [ ] **Step 7.7: Run the full existing receiving test suite**

```bash
pnpm test src/__tests__/receiving-backdate.test.ts src/__tests__/receive-validate.test.ts
```

Expected: still green — we changed the conditional branch but kept the resolved path equivalent.

- [ ] **Step 7.8: Typecheck, lint, full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 7.9: Commit**

```bash
git add -A
git commit -m "feat(receiving): accept unresolved supply lines, write nullable variant stock"
```

### Task 8: `getUnreceivedItems` returns all lines, not just resolved

**Files:**
- Modify: `src/server/functions/store/receiving.ts` (already exports `getUnreceivedItems`)

- [ ] **Step 8.1: Confirm the current behavior**

The current handler at `receiving.ts:74-105` already returns all lines — the filtering happens client-side in `receiving.tsx:100-113`. So no server-side change is strictly required. Confirm by re-reading.

- [ ] **Step 8.2: Add a typed `item` relation to the returned shape if missing**

If `sri.itemColor.item` is the only path to `articleNumber` today, also include `item: { articleNumber, name }` directly (via `with: { item: true }` on the `supply_route_lines` relation) so the receiving page can label aggregate lines.

In the `findMany` for `getUnreceivedItems`, ensure the `with` clause includes whatever's needed. Example:

```ts
const items = await db.query.supplyRouteLines.findMany({
  where: eq(supplyRouteLines.supplyRouteId, data.supplyRouteId),
  with: {
    supplier: true,
    itemColor: { with: { item: true } },
    item: true, // direct FK to items, if the schema has it
  },
})
```

If `supply_route_lines` doesn't have a direct `item_id` FK yet (only via `item_color_id`), that's a separate change. Inspect `src/db/schema/supply-routes.ts` first:

```bash
grep -n "itemId\|item_id" src/db/schema/supply-routes.ts
```

If a direct `itemId` exists on `supply_route_lines`, add the relation. If not, derive item from `itemColor.item` and skip this step.

- [ ] **Step 8.3: Commit**

```bash
git add -A
git commit -m "refactor(receiving): include item relation on unreceived line query"
```

(Skip the commit if Step 8.2 was a no-op.)

---

## Phase 5 — Receiving page UI

### Task 9: Receiving page accepts and displays unresolved lines

**Files:**
- Modify: `src/routes/store/receiving.tsx`

- [ ] **Step 9.1: Update the `items` state type to allow null color/size**

Change the state in `receiving.tsx` from:

```ts
const [items, setItems] = useState<
  Array<{
    id: string
    size: string
    quantity: number
    totalCostUgx: string
    supplier: { name: string }
    itemColor: { colorName: string; colorHex: string; item: { name: string; articleNumber: string } }
  }>
>([])
```

to:

```ts
const [items, setItems] = useState<
  Array<{
    id: string
    size: string | null
    quantity: number
    totalCostUgx: string
    supplier: { name: string }
    itemColor: {
      colorName: string
      colorHex: string
      item: { name: string; articleNumber: string }
    } | null
    item: { name: string; articleNumber: string } | null
  }>
>([])
```

- [ ] **Step 9.2: Drop the `flatMap` filter**

In `loadItems` (~line 88-122), replace the filtering body with:

```ts
const receivable = unreceived.map((i) => ({
  id: i.id,
  size: i.size,
  quantity: i.quantity,
  totalCostUgx: i.totalCostUgx,
  supplier: i.supplier,
  itemColor: i.itemColor ?? null,
  // i.item available when supply-route schema has direct itemId; otherwise fall back
  item:
    i.item ??
    (i.itemColor?.item ?? null),
}))
setUnresolvedCount(receivable.filter((r) => !r.itemColor || !r.size).length)
setItems(receivable)
```

Keep `setUnresolvedCount` updating — we'll use it for a non-blocking informational chip rather than the blocking banner.

- [ ] **Step 9.3: Replace the amber banner with a non-blocking info chip**

Replace the amber blocker JSX (`receiving.tsx:204-211`) with:

```tsx
{unresolvedCount > 0 && (
  <p className="text-sm text-muted-foreground">
    {unresolvedCount} item{unresolvedCount === 1 ? "" : "s"} on this route
    {" "}have no color or size yet. You can receive as-is (they'll land as
    {" "}<em>unresolved</em> stock) or use Split to assign variants now.
  </p>
)}
```

- [ ] **Step 9.4: Update the table row rendering**

Inside `items.map((item) => ...)`, replace the existing "Product" cell content with logic that handles all three states:

```tsx
<TableCell className="font-medium">
  <div className="flex flex-col gap-0.5">
    <span>
      {(item.itemColor?.item.articleNumber ?? item.item?.articleNumber) || "—"}{" "}
      <span className="text-muted-foreground">
        {item.itemColor?.item.name ?? item.item?.name ?? ""}
      </span>
    </span>
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {item.itemColor ? (
        <>
          <span
            className="size-3 rounded-full border"
            style={{ backgroundColor: item.itemColor.colorHex }}
            aria-hidden
          />
          {item.itemColor.colorName}
          {item.size ? ` · ${item.size}` : " · —"}
        </>
      ) : (
        <em>Unresolved</em>
      )}
    </span>
  </div>
</TableCell>
```

Mirror the same logic in the discrepancy dialog row (`receiving.tsx:319-360`).

- [ ] **Step 9.5: Add an inline "Split" button column for unresolved rows**

Add a new `<TableHead />` after "Received" (label: empty / actions). In each `<TableRow>`, render a `<TableCell>` after the Received input:

```tsx
<TableCell>
  {(!item.itemColor || !item.size) && (
    <Button
      variant="outline"
      size="sm"
      className="h-7"
      onClick={() => setSplittingItemId(item.id)}
    >
      <Split className="mr-1 h-3.5 w-3.5" />
      Split
    </Button>
  )}
</TableCell>
```

Add the new state at the top of the component:

```ts
const [splittingItemId, setSplittingItemId] = useState<string | null>(null)
const splittingItem = items.find((i) => i.id === splittingItemId) ?? null
```

Render the dialog (paste below the existing discrepancy dialog):

```tsx
<Dialog
  open={splittingItem !== null}
  onOpenChange={(open) => !open && setSplittingItemId(null)}
>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Split into variants</DialogTitle>
    </DialogHeader>
    {splittingItem && (
      <SplitItemForm
        item={{
          id: splittingItem.id,
          quantity: splittingItem.quantity,
          itemColor: splittingItem.itemColor
            ? {
                id: "", // SplitItemForm uses this only when locking the color
                colorName: splittingItem.itemColor.colorName,
                colorHex: splittingItem.itemColor.colorHex,
                item: splittingItem.itemColor.item,
              }
            : null,
          product: splittingItem.item,
          size: splittingItem.size,
        }}
        onSuccess={() => {
          setSplittingItemId(null)
          if (selectedRouteId) void loadItems(selectedRouteId)
        }}
      />
    )}
  </DialogContent>
</Dialog>
```

Add imports:

```ts
import { Split } from "lucide-react"
import { SplitItemForm } from "#/components/supply/split-item-form"
```

(The `id: ""` for the locked color is a smell — confirm what `SplitItemForm` actually does with `itemColor.id`. If it uses it for the API call, plumb the real `itemColorId` through from `getUnreceivedItems` instead.)

- [ ] **Step 9.6: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green. Fix any narrowing errors revealed by the now-nullable `itemColor` / `size`.

- [ ] **Step 9.7: Manually verify in dev**

```bash
pnpm dev
```

1. Create a supply route with one aggregate item (qty 9) and one fully-resolved item.
2. Visit `/store/receiving` and select the route.
3. Confirm: both rows show in the table. The aggregate row shows "Unresolved" and a Split button; the resolved row shows the color · size.
4. Receive the aggregate one as-is — confirm it succeeds and the navigated `/store` page shows the 9 in stock (will be visible after Phase 7's stock-list update; for now, query the DB directly).
5. Try Split on a different aggregate row — confirm the dialog opens and saving produces two new rows in the receiving table.

- [ ] **Step 9.8: Commit**

```bash
git add src/routes/store/receiving.tsx
git commit -m "feat(receiving): display unresolved lines, inline Split, drop blocker banner"
```

---

## Phase 6 — `specifyStock` server function

Splits an unresolved store-stock row into N variant-keyed rows + optional leftover.

### Task 10: Schema for the new audit action and server fn skeleton

**Files:**
- Modify: `src/server/audit/descriptions.ts` (or wherever audit `action` strings live)

- [ ] **Step 10.1: Locate the audit action registry**

```bash
grep -rn "store.receiveGoods" src/server/audit/ | head -10
```

Open the file that registers action names and their `renderAuditDescription` mapping. Add a new entry:

```ts
"stock.specify": (params: {
  actorName: string
  articleNumber: string
  itemName: string
  specifiedTotal: number
  remainingUnresolved: number
  variantCount: number
}) =>
  `${params.actorName} specified ${params.specifiedTotal}× ` +
  `${params.articleNumber} ${params.itemName} into ` +
  `${params.variantCount} variant${params.variantCount === 1 ? "" : "s"}` +
  (params.remainingUnresolved > 0
    ? `, ${params.remainingUnresolved} left unresolved`
    : ""),
```

- [ ] **Step 10.2: Commit**

```bash
git add src/server/audit/descriptions.ts
git commit -m "feat(audit): register stock.specify action"
```

### Task 11: `specifyStock` server function (TDD)

**Files:**
- Create: `src/server/functions/store/specify.ts`
- Test: `src/__tests__/specify-stock.test.ts` (create)

- [ ] **Step 11.1: Write the failing test — full specification**

```ts
// src/__tests__/specify-stock.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { storeStock, variants } from "#/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { specifyStock } from "#/server/functions/store/specify"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedStore,
  seedUnresolvedStock,
  loginAsAdmin,
} from "./test-helpers"

describe("specifyStock", () => {
  beforeEach(async () => {
    await resetTestDb()
    await loginAsAdmin()
  })

  it("splits an unresolved row into N variant-keyed rows when fully specified", async () => {
    const itemId = await seedItem({ articleNumber: "TR-01", name: "Tee" })
    const burgundyId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const forestId = await seedColor({
      itemId,
      colorName: "Forest",
      colorHex: "#1F3D26",
    })
    const storeId = await seedStore()
    const { stockId, supplyRouteLineId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 9,
      costPerUnitUgx: "100.00",
    })

    await specifyStock({
      data: {
        storeStockId: stockId,
        lines: [
          { colorId: burgundyId, size: "M", quantity: 5 },
          { colorId: forestId, size: "L", quantity: 4 },
        ],
      },
    })

    // Original row gone
    const orig = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, stockId),
    })
    expect(orig).toBeUndefined()

    // Two new variant-keyed rows, qty 5 + 4, inheriting cost
    const newRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, storeId),
        eq(storeStock.itemId, itemId),
        eq(storeStock.supplyRouteLineId, supplyRouteLineId),
      ),
    })
    expect(newRows).toHaveLength(2)
    expect(newRows.map((r) => r.quantityOnHand).sort()).toEqual([4, 5])
    for (const r of newRows) {
      expect(r.costPerUnitUgx).toBe("100.00")
      expect(r.variantId).not.toBeNull()
    }
  })

  it("leaves a leftover unresolved row when specified < total", async () => {
    const itemId = await seedItem({ articleNumber: "TR-02", name: "Tee" })
    const burgundyId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const storeId = await seedStore()
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 9,
      costPerUnitUgx: "100.00",
    })

    await specifyStock({
      data: {
        storeStockId: stockId,
        lines: [{ colorId: burgundyId, size: "M", quantity: 5 }],
      },
    })

    const orig = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, stockId),
    })
    expect(orig?.quantityOnHand).toBe(4)
    expect(orig?.variantId).toBeNull()
  })

  it("creates the variant row if it doesn't exist yet", async () => {
    const itemId = await seedItem({ articleNumber: "TR-03", name: "Tee" })
    const colorId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const storeId = await seedStore()
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })

    await specifyStock({
      data: {
        storeStockId: stockId,
        lines: [{ colorId, size: "XS", quantity: 5 }],
      },
    })

    const v = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, colorId), eq(variants.size, "XS")),
    })
    expect(v).toBeDefined()
  })

  it("rejects when sum(lines) > available qty", async () => {
    const itemId = await seedItem({ articleNumber: "TR-04", name: "Tee" })
    const colorId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const storeId = await seedStore()
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })

    await expect(
      specifyStock({
        data: {
          storeStockId: stockId,
          lines: [{ colorId, size: "M", quantity: 6 }],
        },
      }),
    ).rejects.toThrow(/exceeds available/i)
  })

  it("rejects when source row is variant-keyed (not unresolved)", async () => {
    // Seed a variant-keyed stock row, then attempt specifyStock on it.
    // Expect: throws "already specified" or similar.
  })

  it("rejects when colorId does not belong to the item", async () => {
    // Seed colorId on a *different* item, attempt specifyStock.
    // Expect: throws.
  })
})
```

Add `seedColor` and `seedUnresolvedStock` helpers to `test-helpers.ts`.

- [ ] **Step 11.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/specify-stock.test.ts
```

Expected: FAIL — `specifyStock` not exported.

- [ ] **Step 11.3: Implement**

Create `src/server/functions/store/specify.ts`:

```ts
import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  storeStock,
  variants,
  items as itemsTable,
  itemColors,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { getActorName } from "#/server/audit/actor"

const specifyLineInput = z.object({
  colorId: z.uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

const specifyStockInput = z.object({
  storeStockId: z.uuid(),
  lines: z.array(specifyLineInput).min(1),
})

export const specifyStock = createServerFn()
  .inputValidator(specifyStockInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    return db.transaction(async (tx) => {
      const source = await tx.query.storeStock.findFirst({
        where: eq(storeStock.id, data.storeStockId),
      })
      if (!source) throw new Error("Stock row not found")
      if (source.variantId !== null) {
        throw new Error(
          "Stock row is already specified to a variant — cannot specify again",
        )
      }

      const totalSpecified = data.lines.reduce(
        (s, l) => s + l.quantity,
        0,
      )
      if (totalSpecified > source.quantityOnHand) {
        throw new Error(
          `Specified total (${totalSpecified}) exceeds available (${source.quantityOnHand})`,
        )
      }

      // Validate colors belong to the same item
      for (const line of data.lines) {
        const color = await tx.query.itemColors.findFirst({
          where: eq(itemColors.id, line.colorId),
        })
        if (!color) throw new Error(`Color ${line.colorId} not found`)
        if (color.itemId !== source.itemId) {
          throw new Error(
            `Color ${line.colorId} does not belong to item ${source.itemId}`,
          )
        }
      }

      const item = await tx.query.items.findFirst({
        where: eq(itemsTable.id, source.itemId),
      })
      if (!item) throw new Error("Item not found")

      // For each requested (colorId, size): resolve-or-create variant, then
      // upsert a new variant-keyed stock row sharing the same supply line
      // and cost.
      for (const line of data.lines) {
        let variantRow = await tx.query.variants.findFirst({
          where: and(
            eq(variants.itemId, source.itemId),
            eq(variants.colorId, line.colorId),
            eq(variants.size, line.size),
          ),
        })
        if (!variantRow) {
          const [created] = await tx
            .insert(variants)
            .values({
              itemId: source.itemId,
              colorId: line.colorId,
              size: line.size,
            })
            .returning()
          variantRow = created
        }

        const existing = await tx.query.storeStock.findFirst({
          where: and(
            eq(storeStock.storeId, source.storeId),
            eq(storeStock.itemId, source.itemId),
            eq(storeStock.variantId, variantRow.id),
            source.supplyRouteLineId
              ? eq(storeStock.supplyRouteLineId, source.supplyRouteLineId)
              : isNull(storeStock.supplyRouteLineId),
          ),
        })
        if (existing) {
          await tx
            .update(storeStock)
            .set({
              quantityOnHand: sql`${storeStock.quantityOnHand} + ${line.quantity}`,
            })
            .where(eq(storeStock.id, existing.id))
        } else {
          await tx.insert(storeStock).values({
            storeId: source.storeId,
            itemId: source.itemId,
            variantId: variantRow.id,
            supplyRouteLineId: source.supplyRouteLineId,
            quantityOnHand: line.quantity,
            costPerUnitUgx: source.costPerUnitUgx,
          })
        }
      }

      const remaining = source.quantityOnHand - totalSpecified
      if (remaining === 0) {
        await tx.delete(storeStock).where(eq(storeStock.id, source.id))
      } else {
        await tx
          .update(storeStock)
          .set({ quantityOnHand: remaining })
          .where(eq(storeStock.id, source.id))
      }

      const actorName = await getActorName(tx, session.user.id)
      await recordAuditLog(tx, {
        actorUserId: session.user.id,
        action: "stock.specify",
        entityType: "store_stock",
        entityId: source.id,
        description: renderAuditDescription("stock.specify", {
          actorName,
          articleNumber: item.articleNumber,
          itemName: item.name,
          specifiedTotal: totalSpecified,
          remainingUnresolved: remaining,
          variantCount: data.lines.length,
        }),
        articleNumbers: [item.articleNumber],
        businessDate: null,
        metadata: {
          itemId: source.itemId,
          supplyRouteLineId: source.supplyRouteLineId,
          lines: data.lines,
          remainingUnresolved: remaining,
        },
      })

      return {
        specified: totalSpecified,
        remainingUnresolved: remaining,
      }
    })
  })
```

- [ ] **Step 11.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/specify-stock.test.ts
```

Expected: all PASS. Iterate on any unimplemented edge-case test you stubbed.

- [ ] **Step 11.5: Typecheck, lint, full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 11.6: Commit**

```bash
git add -A
git commit -m "feat(stock): add specifyStock server fn for partial variant specification"
```

---

## Phase 7 — `SpecifyStockDialog` component

Shared dialog used by the store stock list and the item detail page.

### Task 12: Build the dialog

**Files:**
- Create: `src/components/stock/specify-stock-dialog.tsx`

- [ ] **Step 12.1: Read existing color combobox patterns**

```bash
grep -rn "ColorCombobox\|color-combo" src/components/items/ src/components/ | head -10
```

Expected: pick an existing color picker / combobox to reuse. If there's an "Add new color" inline create flow, note its API.

- [ ] **Step 12.2: Write the component**

```tsx
// src/components/stock/specify-stock-dialog.tsx
import { useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { FieldLabel } from "#/components/ui/field-label"
import { InfoTip } from "#/components/ui/info-tip"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Trash2, Plus } from "lucide-react"
import { specifyStock } from "#/server/functions/store/specify"
// Reuse whichever color combobox exists; placeholder import:
import { ColorCombobox } from "#/components/items/color-combobox"

interface DraftLine {
  key: string
  colorId: string | null
  size: string
  quantity: number
}

export function SpecifyStockDialog({
  open,
  onOpenChange,
  storeStockId,
  itemId,
  articleNumber,
  itemName,
  available,
  itemColors,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeStockId: string
  itemId: string
  articleNumber: string
  itemName: string
  available: number
  itemColors: Array<{ id: string; colorName: string; colorHex: string }>
  onSuccess: () => void
}) {
  const [lines, setLines] = useState<DraftLine[]>([
    { key: crypto.randomUUID(), colorId: null, size: "", quantity: 0 },
  ])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const specified = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0), 0),
    [lines],
  )
  const remaining = available - specified
  const overAllocated = remaining < 0
  const valid =
    lines.every(
      (l) => l.colorId && l.size.trim().length > 0 && l.quantity > 0,
    ) &&
    !overAllocated &&
    specified > 0

  function addLine() {
    setLines((ls) => [
      ...ls,
      { key: crypto.randomUUID(), colorId: null, size: "", quantity: 0 },
    ])
  }

  function removeLine(key: string) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)))
  }

  async function submit() {
    if (!valid) return
    setPending(true)
    setError(null)
    try {
      await specifyStock({
        data: {
          storeStockId,
          lines: lines.map((l) => ({
            colorId: l.colorId!,
            size: l.size.trim(),
            quantity: l.quantity,
          })),
        },
      })
      onSuccess()
      onOpenChange(false)
      setLines([
        { key: crypto.randomUUID(), colorId: null, size: "", quantity: 0 },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to specify")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Specify variants for {articleNumber} — {available} unresolved
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {itemName}. Add one row per (color, size) you want to label. You can
          leave some quantity unresolved and specify it later.{" "}
          <InfoTip term="col.unresolved" />
        </p>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <FieldLabel>Color</FieldLabel>
                <ColorCombobox
                  itemId={itemId}
                  itemColors={itemColors}
                  value={l.colorId}
                  onChange={(colorId) =>
                    setLines((ls) =>
                      ls.map((x) =>
                        x.key === l.key ? { ...x, colorId } : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="col-span-4">
                <FieldLabel>Size</FieldLabel>
                <Input
                  value={l.size}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x) =>
                        x.key === l.key ? { ...x, size: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="e.g. M"
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>Qty</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  max={available}
                  value={l.quantity || ""}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x) =>
                        x.key === l.key
                          ? {
                              ...x,
                              quantity: Math.max(
                                0,
                                Math.floor(Number(e.target.value) || 0),
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => removeLine(l.key)}
                  disabled={lines.length === 1}
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add variant
          </Button>
        </div>

        <p className="text-sm">
          <span className="font-mono">{specified}</span> of{" "}
          <span className="font-mono">{available}</span> specified —{" "}
          {overAllocated ? (
            <span className="text-destructive">
              {Math.abs(remaining)} over the available qty
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-mono">{remaining}</span> will stay
              unresolved
            </span>
          )}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || pending}>
            {pending ? "Specifying…" : "Specify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

If `ColorCombobox` does not exist as written, replace with the existing color picker (look in `src/components/items/`). If none exists, fall back to a `<Select>` populated from `itemColors` with an "Add new color" path that calls the existing color-create server fn.

- [ ] **Step 12.3: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 12.4: Commit**

```bash
git add src/components/stock/specify-stock-dialog.tsx
git commit -m "feat(stock): add SpecifyStockDialog shared component"
```

---

## Phase 8 — Store stock list shows resolved + unresolved breakdown

### Task 13: Group-by-item with expandable variant detail and Specify button

**Files:**
- Modify: `src/routes/store/index.tsx` (or wherever the store stock list lives — confirm path)
- Modify: `src/server/functions/store/receiving.ts` (`getStoreStock` — adjust shape)

- [ ] **Step 13.1: Confirm the route and current shape**

```bash
grep -rn "getStoreStock\|storeStock" src/routes/store/ | head -10
```

Locate where stock is rendered. Open the file.

- [ ] **Step 13.2: Update `getStoreStock` to return items with nested rows**

Replace the existing handler (in `src/server/functions/store/receiving.ts:396-407`) with:

```ts
export const getStoreStock = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const store = await db.query.stores.findFirst()
  if (!store) return []

  const rows = await db.query.storeStock.findMany({
    where: eq(storeStock.storeId, store.id),
    with: {
      item: { with: { colors: true } },
      variant: { with: { color: true } },
      supplyRouteLine: true,
    },
  })

  // Group by item.
  const byItem = new Map<
    string,
    {
      item: typeof rows[number]["item"]
      totalQty: number
      rows: typeof rows
    }
  >()
  for (const r of rows) {
    const key = r.itemId
    const bucket = byItem.get(key) ?? {
      item: r.item,
      totalQty: 0,
      rows: [],
    }
    bucket.totalQty += r.quantityOnHand
    bucket.rows.push(r)
    byItem.set(key, bucket)
  }

  return Array.from(byItem.values())
})
```

Add `item` to the `storeStockRelations` definition in `src/db/schema/store.ts` if not already added (Task 2 added it; confirm).

- [ ] **Step 13.3: Update the store stock list page UI**

In the route component, render the new grouped shape. Pseudocode:

```tsx
{groups.map((g) => (
  <ItemStockRow key={g.item.id} group={g} onSpecified={() => router.invalidate()} />
))}
```

Where `ItemStockRow` is a local component:

```tsx
function ItemStockRow({
  group,
  onSpecified,
}: {
  group: { item: Item; totalQty: number; rows: StockRow[] }
  onSpecified: () => void
}) {
  const [open, setOpen] = useState(false)
  const [specifying, setSpecifying] = useState<string | null>(null)
  const lowStock =
    group.item.lowStockThreshold !== null &&
    group.totalQty < group.item.lowStockThreshold

  return (
    <>
      <TableRow onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        <TableCell>{open ? <ChevronDown /> : <ChevronRight />}</TableCell>
        <TableCell className="font-medium">
          {group.item.articleNumber}{" "}
          <span className="text-muted-foreground">{group.item.name}</span>
        </TableCell>
        <TableCell>{group.item.category}</TableCell>
        <TableCell className="text-right font-mono">
          {group.totalQty}
          {lowStock && (
            <Badge variant="destructive" className="ml-2">
              Low
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">
          {roundUgxFloor50(group.item.minimumSellPriceUgx).toFormat(0)}
        </TableCell>
      </TableRow>
      {open &&
        group.rows.map((r) => (
          <TableRow key={r.id} className="bg-muted/30">
            <TableCell />
            <TableCell className="pl-8 text-sm">
              {r.variant ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-full border"
                    style={{ backgroundColor: r.variant.color.colorHex }}
                    aria-hidden
                  />
                  {r.variant.color.colorName} · {r.variant.size}
                </span>
              ) : (
                <em className="text-muted-foreground">Unresolved</em>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.supplyRouteLine?.id?.slice(0, 8) ?? "—"}
            </TableCell>
            <TableCell className="text-right font-mono">
              {r.quantityOnHand}
            </TableCell>
            <TableCell className="text-right">
              {!r.variant && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSpecifying(r.id)}
                >
                  Specify
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      {specifying && (
        <SpecifyStockDialog
          open={true}
          onOpenChange={(open) => !open && setSpecifying(null)}
          storeStockId={specifying}
          itemId={group.item.id}
          articleNumber={group.item.articleNumber}
          itemName={group.item.name}
          available={
            group.rows.find((r) => r.id === specifying)?.quantityOnHand ?? 0
          }
          itemColors={group.item.colors ?? []}
          onSuccess={onSpecified}
        />
      )}
    </>
  )
}
```

For `itemColors`, add a small fetch — either a new server fn `getItemColors({itemId})` or include colors on the item relation in `getStoreStock`.

- [ ] **Step 13.4: Add `getItemColors` server fn (if not already present)**

Check first:

```bash
grep -rn "getItemColors\|listItemColors" src/server/functions/items/colors.ts
```

If absent, add:

```ts
// src/server/functions/items/colors.ts
export const getItemColors = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    return db.query.itemColors.findMany({
      where: eq(itemColors.itemId, data.itemId),
      orderBy: (c, { asc }) => [asc(c.colorName)],
    })
  })
```

Wire it into the dialog (load on open, cache in state).

- [ ] **Step 13.5: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 13.6: Manually verify in dev**

```bash
pnpm dev
```

1. Receive an aggregate supply line (9 units) using the Receiving page.
2. Visit `/store` (the stock list). Confirm the V-Neck row shows 9 total with an "Unresolved" sub-row.
3. Click Specify. Specify 5 Burgundy/M, leave 4 unresolved. Confirm the row now shows 2 sub-rows: 5 Burgundy · M and 4 Unresolved.
4. Specify the remaining 4 as Forest/L. Confirm only the 2 variant sub-rows remain; the Unresolved sub-row is gone.

- [ ] **Step 13.7: Commit**

```bash
git add -A
git commit -m "feat(stock): group store stock by item with Specify action on unresolved rows"
```

---

## Phase 9 — Wrap up

### Task 14: Run full validation suite

- [ ] **Step 14.1**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. If anything fails, fix at the root (not by tweaking the assertion).

- [ ] **Step 14.2: Spot-check related e2e specs**

```bash
ls cypress/e2e | grep -E "receiv|stock|item"
```

For each relevant spec, run individually:

```bash
pnpm test:e2e -- --spec cypress/e2e/<file>
```

Update any that asserted the old "split before receiving" blocker or per-stock-row min price. Update assertions to match the new UI; don't delete tests.

- [ ] **Step 14.3: Commit any e2e fixes**

```bash
git add -A
git commit -m "test(e2e): update specs for variant-flexibility receiving + stock list"
```

### Task 15: Update CLAUDE.md / memory if applicable

- [ ] **Step 15.1:** If `CLAUDE.md` references the old "must split before receiving" invariant or per-stock min price, update those sections to reflect the new model. If the memory file `feedback_info_tips.md` lists fields, add the new InfoTip terms (`item.minSellPrice`, `item.lowStockThreshold`, `item.variantsOptional`, `col.unresolved`).

- [ ] **Step 15.2: Commit**

```bash
git add CLAUDE.md  # or whichever files changed
git commit -m "docs: note variant-flexibility model in CLAUDE.md"
```

(Skip commit if no doc changes were needed.)

---

## What Plan 2 will pick up

After this plan executes successfully, Plan 2 (`docs/superpowers/plans/2026-06-XX-variant-flexibility-plan-2-sales-transfers.md`, to be written) will land:

1. Schema: `item_id NOT NULL` + nullable `variant_id` on `shop_stock`, `sale_lines`, `transfer_lines`, `return_lines`, `low_stock_alerts`, `restock_requisitions`, `notification_threshold_overrides`, `stock_take_lines`.
2. POS picker — item-level add-to-cart with unresolved-first FIFO decrement.
3. Returns and transfers handle nullable variant.
4. Low-stock notification job rewritten to group by item.
5. Audit `lines[]` metadata reshape across `store.receiveGoods`, `shop.recordSale`, `store.transferToShop`, etc.

Until Plan 2 lands, Plan 1's stock can sit unresolved in store stock but must be specified before it can be transferred to a shop or sold.

---

## Risks & open questions

- **`UNIQUE NULLS NOT DISTINCT` and drizzle-kit:** confirm drizzle-kit emits the `NULLS NOT DISTINCT` clause when the `unique(..., { nulls: "not distinct" })` option is used. If not, hand-edit the generated migration SQL. (Drizzle ≥ 0.31 supports this option.)
- **`supply_route_lines.itemId`:** several tasks assume the supply line carries an `item_id` (directly or via `itemColor.itemId`). If neither is available for aggregate lines, add the column in a precursor task before Phase 4.
- **`SplitItemForm.itemColor.id`:** the dialog wiring on the receiving page uses an empty-string placeholder for `id`. Resolve by either threading the real `item_color_id` through `getUnreceivedItems` or making `id` optional on `SplittableItem`. Note + fix as you go.
- **`getStoreStock` shape change:** the route component(s) that consume this fn will need updates beyond what's listed here if the layout differs from the pseudocode. Treat the rendering example as a template, not a literal patch.

---

## Self-review checklist (for the implementer)

- [ ] All Phase 1 schema changes have `itemId` and `variantId` semantics matching the spec exactly.
- [ ] Every test added is run at least once with a failing assertion before its implementation lands.
- [ ] No `setMinimumSellPrice` callers remain.
- [ ] Receiving page does **not** filter out unresolved lines.
- [ ] `specifyStock` rejects when `colorId` belongs to a different item.
- [ ] Audit log entries written for `stock.specify` include `lines[]` and `remainingUnresolved`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` passes after each task.
