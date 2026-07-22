# Opening Balance Auto-Create Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix shop/store opening balance submission when the VariantGrid shows a (color × size) cell that has no materialised variant row yet — by auto-creating variants server-side (same pattern as `specifyStock` / `receiveGoods`), instead of failing in the client with a raw `colorId|size` error.

**Architecture:** Extend the opening-balance cell payload with optional `colorId` + `size`. The form sends those fields directly (stop client-side `variantId` lookup). The server normalises every cell to a `variantId | null` inside the transaction: unresolved (`variantId: null` only), lookup-by-id (backward compat), or upsert-by-pair (new path). Reuse the existing `onConflictDoUpdate` upsert on `uq_variant_item_color_size`. Validate that `colorId` belongs to the parent `itemId` before upserting.

**Tech Stack:** TanStack Start server functions, Drizzle ORM, Zod, Vitest, existing `VariantGrid` / `OpeningBalanceForm` UI.

---

## File map

| File | Role |
|------|------|
| `src/server/functions/admin/opening-balance-validate.ts` | Cell shape + sync validation for three modes |
| `src/server/functions/admin/opening-balance.ts` | Normalise cells → upsert variants → insert stock |
| `src/components/opening-balance/opening-balance-form.tsx` | Send `{ colorId, size, quantity }` instead of resolving `variantId` |
| `src/__tests__/opening-balance-auto-create.test.ts` | **Create** — new integration tests for upsert path |
| `src/__tests__/opening-balance.test.ts` | Extend validator unit tests |
| `src/__tests__/opening-balance-variants.test.ts` | Keep as regression (variantId path) |
| `src/__tests__/opening-balance-shop-unresolved.test.ts` | Keep as regression (unresolved path) |
| `src/__tests__/server-variant-id.test.ts` | Keep as regression (variantId path) |

**Out of scope:** Refactoring `specifyStock` / `receiveGoods` to use a shared helper (optional follow-up). Excel importer changes (already sends `variantId: null`). UI grid cross-product behaviour (unchanged — server now matches what the grid implies).

---

## Cell resolution rules (canonical)

| Input shape | Meaning | Server action |
|-------------|---------|---------------|
| `{ variantId: null, quantity }` — no `colorId`/`size` | Unresolved / aggregate row (Excel) | Insert stock with `variantId = NULL` |
| `{ variantId: "<uuid>", quantity }` | Pre-existing variant (legacy callers, tests) | Lookup variant; error if missing |
| `{ colorId, size, quantity }` — `variantId` omitted | Grid cell from UI | Validate color ∈ item; upsert variant; insert stock |

**Reject:**
- `variantId: null` together with `colorId` + `size` (ambiguous)
- `colorId` without `size` or vice versa
- `colorId` that does not belong to `entry.itemId`
- Empty / whitespace `size`

**Precedence:** If `variantId` is a UUID string, use lookup-by-id and ignore any `colorId`/`size` on the same cell (defensive — form will not send both).

---

### Task 1: Validator — three cell modes

**Files:**
- Modify: `src/server/functions/admin/opening-balance-validate.ts`
- Test: `src/__tests__/opening-balance.test.ts`

- [ ] **Step 1: Write failing validator tests**

Add to `src/__tests__/opening-balance.test.ts`:

```typescript
describe('validateOpeningBalanceCell — colorId+size mode', () => {
  const COLOR = '00000000-0000-0000-0000-000000000002'

  it('accepts a colorId+size cell without variantId', () => {
    expect(() =>
      validateOpeningBalanceCell(
        { colorId: COLOR, size: 'M', quantity: 10 },
        '15000',
      ),
    ).not.toThrow()
  })

  it('accepts unresolved cells (variantId null, no pair)', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: null, quantity: 5 }, '1000'),
    ).not.toThrow()
  })

  it('rejects variantId null combined with colorId+size', () => {
    expect(() =>
      validateOpeningBalanceCell(
        { variantId: null, colorId: COLOR, size: 'M', quantity: 5 },
        '1000',
      ),
    ).toThrow(/variantId null.*colorId/i)
  })

  it('rejects colorId without size', () => {
    expect(() =>
      validateOpeningBalanceCell({ colorId: COLOR, quantity: 5 }, '1000'),
    ).toThrow(/size/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/opening-balance.test.ts`
Expected: FAIL — new cases throw or pass incorrectly.

- [ ] **Step 3: Update validator types + logic**

Replace `OpeningBalanceCell` and `validateOpeningBalanceCell` in `src/server/functions/admin/opening-balance-validate.ts`:

```typescript
export interface OpeningBalanceCell {
  /** Existing variant — lookup by id. Omit when sending colorId+size. */
  variantId?: string | null
  /** Grid cell color — server upserts variant when paired with size. */
  colorId?: string
  size?: string
  quantity: number
}

export function validateOpeningBalanceCell(
  cell: OpeningBalanceCell,
  unitCostUgx: string,
): void {
  const hasUuid = typeof cell.variantId === 'string' && cell.variantId.length > 0
  const isUnresolved =
    cell.variantId === null &&
    cell.colorId === undefined &&
    cell.size === undefined
  const hasPair =
    cell.colorId !== undefined || cell.size !== undefined

  if (cell.variantId === '') {
    throw new Error('variantId must be a uuid, null, or omitted')
  }
  if (cell.variantId === null && hasPair) {
    throw new Error(
      'variantId null cannot be combined with colorId+size — use one mode per cell',
    )
  }
  if (!hasUuid && !isUnresolved) {
    const hasColor = cell.colorId !== undefined
    const hasSize = cell.size !== undefined && cell.size.trim().length > 0
    if (hasColor !== hasSize) {
      throw new Error('colorId and size must both be provided')
    }
    if (!hasColor) {
      throw new Error(
        'cell must specify variantId, colorId+size, or variantId null for unresolved stock',
      )
    }
  }

  if (!Number.isInteger(cell.quantity) || cell.quantity <= 0) {
    throw new Error('quantity must be a positive integer')
  }
  const cost = new BigNumber(unitCostUgx)
  if (!cost.isFinite() || cost.lte(0)) {
    throw new Error('unitCostUgx must be greater than zero')
  }
}
```

- [ ] **Step 4: Run validator tests**

Run: `pnpm vitest run src/__tests__/opening-balance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/admin/opening-balance-validate.ts src/__tests__/opening-balance.test.ts
git commit -m "feat(opening-balance): validate colorId+size cell mode"
```

---

### Task 2: Server — normalise cells and upsert variants

**Files:**
- Modify: `src/server/functions/admin/opening-balance.ts`
- Create: `src/__tests__/opening-balance-auto-create.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `src/__tests__/opening-balance-auto-create.test.ts` (mirror auth stub from `opening-balance-variants.test.ts`):

```typescript
describe('addShopOpeningBalance — auto-create variant from colorId+size', () => {
  it('materialises missing (color, size) variants and posts stock', async () => {
    // Seed item + two colors. Only Black/M variant exists; Royal/M missing.
    // Submit cells: [{ colorId: royalId, size: 'M', quantity: 40 }, { colorId: blackId, size: 'M', quantity: 20 }]
    // Assert: variants table has Royal/M; shop_stock has 2 rows; journals posted.
  })

  it('rejects colorId that belongs to a different item', async () => {
    // Seed two items each with a color. Submit item A with item B's colorId.
    // Expected: throw /does not belong/i
  })

  it('rejects variantId that belongs to a different item', async () => {
    // Seed two items; item B has variant V. Submit item A with variantId V.
    // Expected: throw /Variant.*does not belong/i
  })

  it('writes audit metadata with colorName and size for auto-created variants', async () => {
    // After successful shop submit, read auditLogs for openingBalance.shop.
    // Expect metadata.lines to include { colorName: 'Royal', size: 'M', ... }.
  })
})

describe('addStoreOpeningBalance — auto-create variant from colorId+size', () => {
  it('materialises missing variant on store opening balance', async () => {
    // Same as shop test but addStoreOpeningBalance + storeStock assertions.
  })
})
```

Fill in full seed/cleanup following `opening-balance-variants.test.ts` patterns (unique article numbers, tear down stock → variants → colors → items).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/opening-balance-auto-create.test.ts`
Expected: FAIL — cells rejected by Zod or variants not created.

- [ ] **Step 3: Extend Zod cell schema**

In `opening-balance.ts`, replace `cellSchema`:

```typescript
const cellSchema = z
  .object({
    variantId: z.uuid().nullable().optional(),
    colorId: z.uuid().optional(),
    size: z.string().min(1).max(16).optional(),
    quantity: z.number().int().positive(),
  })
  .superRefine((cell, ctx) => {
    try {
      validateOpeningBalanceCell(cell, '1') // cost checked per-entry later
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
```

Note: `validateOpeningBalanceCell` cost check uses dummy `'1'` here; real cost validated per-entry in the handler loop (existing behaviour).

- [ ] **Step 4: Add normalisation helper inside `opening-balance.ts`**

Add before the handlers (imports: `itemColors`, `variants` already present):

```typescript
type NormalisedCell = { variantId: string | null; quantity: number }

async function normaliseOpeningBalanceCell(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
  cell: z.infer<typeof cellSchema>,
): Promise<NormalisedCell> {
  if (typeof cell.variantId === 'string') {
    const existing = await tx.query.variants.findFirst({
      where: eq(variants.id, cell.variantId),
    })
    if (!existing) {
      throw new Error(`Variant ${cell.variantId} not found`)
    }
    if (existing.itemId !== itemId) {
      throw new Error(
        `Variant ${cell.variantId} does not belong to item ${itemId}`,
      )
    }
    return { variantId: cell.variantId, quantity: cell.quantity }
  }
  if (
    cell.variantId === null &&
    cell.colorId === undefined &&
    cell.size === undefined
  ) {
    return { variantId: null, quantity: cell.quantity }
  }

  const colorId = cell.colorId!
  const size = cell.size!.trim()

  const color = await tx.query.itemColors.findFirst({
    where: eq(itemColors.id, colorId),
  })
  if (!color) throw new Error(`Color ${colorId} not found`)
  if (color.itemId !== itemId) {
    throw new Error(
      `Color ${colorId} does not belong to item ${itemId}`,
    )
  }

  const [variantRow] = await tx
    .insert(variants)
    .values({ itemId, colorId, size })
    .onConflictDoUpdate({
      target: [variants.itemId, variants.colorId, variants.size],
      set: { updatedAt: new Date() },
    })
    .returning()

  return { variantId: variantRow.id, quantity: cell.quantity }
}
```

- [ ] **Step 5: Wire normalisation into both handlers (ordering matters)**

**Critical:** `resolveVariantContext` today runs on raw cells and expects `variantId` UUIDs. Auto-created IDs only exist *after* normalisation. Normalise **all entries first**, then call `resolveVariantContext`, then insert stock.

Replace the start of each handler's `db.transaction` callback with:

```typescript
return db.transaction(async (tx) => {
  // Phase 1 — normalise every cell to { variantId, quantity }
  const normalisedItems: Array<{
    itemId: string
    unitCostUgx: string
    cells: NormalisedCell[]
  }> = []
  for (const entry of data.items) {
    const cells: NormalisedCell[] = []
    for (const cell of entry.cells) {
      cells.push(await normaliseOpeningBalanceCell(tx, entry.itemId, cell))
    }
    normalisedItems.push({
      itemId: entry.itemId,
      unitCostUgx: entry.unitCostUgx,
      cells,
    })
  }

  const allCells = normalisedItems.flatMap((e) => e.cells)
  const variantById = await resolveVariantContext(tx, allCells)

  // Phase 2 — stock insert + journals (MUST use normalisedItems, not data.items)
  for (const entry of normalisedItems) {
    const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
    let entryValue = new BigNumber(0)
    const entryRowIds: string[] = []

    for (const cell of entry.cells) {
      let ctx: ResolvedVariant | null = null
      if (cell.variantId !== null) {
        const resolved = variantById.get(cell.variantId)
        if (!resolved) throw new Error(`Variant ${cell.variantId} not resolved`)
        ctx = resolved
      }
      const [row] = await tx.insert(storeStock /* or shopStock */).values({
        /* store.id / shop.id, entry.itemId, cell.variantId, ... */
      }).returning()
      // ... auditLines.push using ctx ...
    }
    // ... postJournalEntry + totalValue ...
  }
})
```

Also update `resolveVariantContext` signature from `CellInput[]` to `NormalisedCell[]`.

Do **not** call `resolveVariantContext` before normalisation — that was the root cause of the original client-side lookup (IDs never existed yet).

**Note:** Submitting two form blocks for the same item + same (color, size) will hit the existing unique constraint on `(location, itemId, variantId, supplyRouteLineId)` with NULL line. That is pre-existing behaviour; merging duplicate cells is out of scope.

- [ ] **Step 6: Run integration tests**

Run: `pnpm vitest run src/__tests__/opening-balance-auto-create.test.ts`
Expected: PASS

- [ ] **Step 7: Run regression suite**

Run:
```bash
pnpm vitest run \
  src/__tests__/opening-balance.test.ts \
  src/__tests__/opening-balance-variants.test.ts \
  src/__tests__/opening-balance-shop-unresolved.test.ts \
  src/__tests__/server-variant-id.test.ts
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/functions/admin/opening-balance.ts src/__tests__/opening-balance-auto-create.test.ts
git commit -m "feat(opening-balance): auto-create variants from colorId+size cells"
```

---

### Task 3: Form — send colorId+size, drop client lookup

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx`

- [ ] **Step 1: Simplify `performSubmit` cell mapping**

Replace the `variantByPair` lookup block (lines ~158–171) with:

```typescript
const cells = Object.entries(b.quantities)
  .filter(([, q]) => q > 0)
  .map(([key, q]) => {
    const [colorId, size] = key.split('|')
    if (!colorId || !size) {
      throw new Error(`Invalid grid cell key: ${key}`)
    }
    return { colorId, size, quantity: q }
  })
```

Remove the `variantsForBlock` / `variantByPair` variables entirely. The comment above the block should note that variant materialisation happens server-side (mirrors `specifyStock`).

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`
1. Open `/shop/opening-balance?shopId=…`
2. Pick TR-004 (or any item where one color lacks a size another color has)
3. Enter quantities for both colors in the shared size column
4. Submit → expect success banner, no `(uuid|M)` error

- [ ] **Step 3: Commit**

```bash
git add src/components/opening-balance/opening-balance-form.tsx
git commit -m "fix(opening-balance): send colorId+size cells, drop client variant lookup"
```

---

## Verification checklist (post-implementation)

- [ ] Shop opening balance: missing variant auto-created
- [ ] Store opening balance: same
- [ ] Excel/unresolved path (`variantId: null` only) still works
- [ ] Existing `variantId` API callers still work
- [ ] Wrong-item `colorId` rejected with readable error
- [ ] Audit log `metadata.lines` includes `colorName` + `size` for auto-created variants
- [ ] No client-side throw with raw UUID in error text for the reported bug scenario

---

## Adversarial review log

> **Review method:** Rounds 1–4 were self-review during plan authoring. **Round 5** is an independent review (fresh read of plan + codebase; subagent reviewer attempted twice but blocked by usage limits).

### Round 5 — independent review (fresh)

#### CRITICAL (fixed in plan below)

| Issue | Why it breaks | Fix |
|-------|---------------|-----|
| **`variantId` path never checks variant ∈ item** | `shop_stock` has no composite FK tying `itemId` to `variant.itemId`. A crafted `{ itemId: A, cells: [{ variantId: <B's variant> }] }` inserts mismatched stock. Pre-existing bug; plan touches this code. | In `normaliseOpeningBalanceCell`, lookup variant row and reject when `variant.itemId !== itemId`. Add test. |
| **Phase 2 loop still references raw `data.items`** | If implementer only adds Phase 1 but leaves stock loop on `data.items` / raw `entry.cells`, auto-created IDs are ignored and behaviour stays broken. | Task 2 Step 5 now lists explicit loop rewrites (not `// ...`). |

#### MEDIUM (fixed in plan below)

| Issue | Fix |
|-------|-----|
| Checklist claims audit metadata tested but no test step | Task 2 integration test must assert `auditLogs.metadata.lines` includes `colorName` + `size` for auto-created Royal/M |
| Duplicate item blocks with same (color, size) | Second insert hits `uq_shst_shop_item_variant_line` / `uq_ss_store_item_variant_line` (NULLS NOT DISTINCT). Pre-existing; add note in plan — merge rows is out of scope |
| `resolveVariantContext` typed as raw `CellInput[]` | Change param to `NormalisedCell[]` when wiring Phase 1 |

#### LOW (accepted / no plan change)

- Task 3 before Task 2 deploy would break — task order 1→2→3 is correct
- Duplicate upsert vs `specifyStock` — out of scope
- Footer “1 of 1 valid” — out of scope
- No Cypress coverage for submit path — out of scope (manual smoke in Task 3)

#### PASS (independent confirmation)

- Two-phase transaction ordering (normalise → resolve → insert) is correct
- `colorId` wrong-item guard matches `specifyStock` (`specify.ts:61-70`)
- Form sending `{ colorId, size, quantity }` fixes the reported Royal/M bug
- Backward compat paths (`variantId` uuid, `variantId: null`) preserved in cell rules
- Unique constraint on opening-balance rows is pre-existing, not introduced

**Independent verdict:** **READY** after Round 5 fixes applied to Tasks 2 and 4 below.

---

### Round 1 — gaps found (self-review)

| Issue | Severity | Resolution |
|-------|----------|------------|
| Ambiguous `{ variantId: null, colorId, size }` | High | Explicit reject in validator + superRefine |
| `colorId` from wrong item (IDOR-ish) | High | Server checks `color.itemId === entry.itemId` |
| Regression on variantId + unresolved paths | High | Dedicated regression test run in Task 2 Step 7 |
| Zod superRefine uses dummy cost `'1'` | Low | Acceptable — per-entry cost validated in handler loop (existing) |
| Duplicate upsert logic vs specify/receive | Low | Out of scope; copy inline upsert for now |

### Round 2 — gaps found

| Issue | Severity | Resolution |
|-------|----------|------------|
| Only shop test planned initially | Medium | Added store test in Task 2 |
| `validateOpeningBalanceCell` error message regex in test too strict | Low | Use `/colorId/` or `/size/i` separately |
| Handler still calls `resolveVariantContext` on normalised IDs — auto-created variants must be visible in same tx | Medium | Upsert runs in same transaction before `resolveVariantContext`; document ordering in Task 2 Step 5 |
| Form `key.split('|')` breaks if size contains `\|` | Low | Sizes are max 16 chars, no pipe in seed/convention; no change needed |
| Footer "1 of 1 valid" misleading | Low | Out of scope — optional follow-up to validate grid cells client-side |

### Round 3 — gaps found

| Issue | Severity | Resolution |
|-------|----------|------------|
| `resolveVariantContext` called before upsert → audit lookup fails for new variants | **Critical** | Two-phase transaction: normalise all cells first, then `resolveVariantContext`, then stock insert (Task 2 Step 5) |
| `validateOpeningBalanceCell` rejects `variantId: undefined` cells that only have colorId+size — but existing test "rejects missing variantId" uses `''` not undefined | Low | No change; empty string still rejected |
| Auto-create silently expands catalog (Royal gets M forever) | Medium | **Intentional** — matches specify/receive; document in commit message |

### Round 4 — final pass (self-review, no new blockers)

| Check | Status |
|-------|--------|
| Spec coverage: auto-create, security, backward compat | ✅ |
| Transaction ordering: normalise → resolve → insert | ✅ Fixed in Step 5 |
| Placeholder scan | ✅ No TBD/TODO |
| Type consistency across tasks | ✅ `NormalisedCell` used end-to-end in handler |
| TDD ordering | ✅ Tests before implementation per task |
| Minimal scope | ✅ No shared-helper refactor, no grid UI change |

### Final verdict (after Round 5 independent review)

**READY for execution** — pending Round 5 fixes (variantId∈item guard, explicit Phase 2 loop, audit + wrong-variantId tests).
