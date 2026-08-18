# Item Design and Multiple Article Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-to-one item/article-number model with item-level commercial data and a globally unique, manageable collection of article numbers while replacing item category with design.

**Architecture:** Keep `items.id` as the stable parent identity. Add an `item_article_numbers` child table with canonical uppercase values and a database uniqueness constraint. Move all current article-number lookup/search logic to joins against that table, while leaving stock, sales, transfers, returns, supply lines, notifications, and audit relationships item-level.

**Tech Stack:** TanStack Start server functions, React/TanStack Router, Drizzle ORM, PostgreSQL migrations, Zod, Vitest, Cypress, shadcn/ui.

---

## Plan-wide invariants

- `items.design` is required and replaces only the catalog `category`; accounting transaction categories remain untouched.
- `items.id` remains the stable foreign-key target and is never regenerated.
- Every active or archived item has at least one article number.
- Article numbers are stored as `trim().toUpperCase()` values and are globally unique, including archived items.
- Prices, supplier data, colors, sizes, images, and low-stock settings remain on the parent item.
- Historical `article_number_snapshot` text remains unchanged.
- No consumer may read `item.articleNumber` or `item.category` after the migration.

## Task 1: Establish the failing contract tests and baseline

**Files:**
- Create: `src/lib/items/article-number.test.ts`
- Create: `src/__tests__/items-article-numbers.test.ts`
- Modify: `src/__tests__/test-helpers.ts`

- [ ] **Step 1: Write normalization tests before implementation.**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeArticleNumber } from '#/lib/items/article-number'

describe('normalizeArticleNumber', () => {
  it('trims whitespace and normalizes case', () => {
    expect(normalizeArticleNumber('  ts-01 ')).toBe('TS-01')
  })

  it('rejects a blank value', () => {
    expect(() => normalizeArticleNumber('  ')).toThrow(
      'Article number is required',
    )
  })
})
```

- [ ] **Step 2: Write server contract tests for the required behaviors.**

The integration test must use the existing test database helpers and assert:

```ts
it('creates one item with multiple article numbers and searches by each number', async () => {
  const item = await createItemQuery({
    name: 'T-shirt',
    design: 'Round neck',
    articleNumbers: ['ts-001', 'TS-002'],
    description: undefined,
    supplierId: supplier.id,
    costPrice: '10',
    costCurrency: 'RMB',
    sizes: [],
    colors: [],
    minimumSellPriceUgx: '20000',
    lowStockThreshold: null,
  })

  expect(item.articleNumbers.map((n) => n.articleNumber)).toEqual([
    'TS-001',
    'TS-002',
  ])
  expect((await searchItemsQuery({ query: 'ts-002' }))[0].id).toBe(item.id)
})

it('rejects a number already owned by another item', async () => {
  await expect(
    createItemQuery({ ...validItemInput, articleNumbers: ['TS-001'] }),
  ).rejects.toThrow('Article number already belongs to another item')
})

it('rejects removing the last article number', async () => {
  await expect(
    removeItemArticleNumberQuery({ itemId, articleNumberId: onlyNumber.id }),
  ).rejects.toThrow('An item must have at least one article number')
})
```

The test file must also cover duplicate numbers within one request, archived
item collisions, add/remove operations, design persistence, and unchanged
item-level pricing. Use concrete fixture builders rather than mocking the
database query layer.

- [ ] **Step 3: Run the new tests and record the expected RED failure.**

Run:

```bash
pnpm vitest run src/lib/items/article-number.test.ts src/__tests__/items-article-numbers.test.ts
```

Expected: failure because `normalizeArticleNumber`, the child relation, and
the article-number query operations do not yet exist.

- [ ] **Step 4: Run the current focused baseline before changing production code.**

Run:

```bash
pnpm vitest run src/__tests__/item-editor-validation.test.tsx src/__tests__/products-server.test.ts src/__tests__/item-delete.test.ts src/__tests__/item-archive.test.ts
```

Record any pre-existing failures separately; do not attribute them to this
feature.

## Task 2: Implement normalization, schema, and the forward migration

**Files:**
- Modify: `src/lib/items/article-number.ts`
- Create: `src/db/schema/item-article-numbers.ts`
- Modify: `src/db/schema/items.ts`
- Modify: `src/db/schema/index.ts`
- Delete: `src/db/schema/item-categories.ts`
- Create: `drizzle/0014_item_design_article_numbers.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/db/seed.ts`

- [ ] **Step 1: Implement the minimal normalization helper to turn Task 1 green.**

```ts
export function normalizeArticleNumber(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!normalized) throw new Error('Article number is required')
  return normalized
}
```

Keep `suggestArticleNumber` only if its callers still need suggestions, but
change its input vocabulary from `category` to `design`. It must not be used
to silently create an article number.

- [ ] **Step 2: Add the child table and relations.**

The Drizzle table must define `id`, `itemId`, `articleNumber`, timestamps, a
unique index on `articleNumber`, and an item lookup index. `items` must expose
`articleNumbers: many(itemArticleNumbers)`. The child relation must point back
to `items` with `onDelete: cascade`.

- [ ] **Step 3: Change the item schema from category/article number to design/article-number relation.**

Remove `items.articleNumber`, `items.categoryId`, the item-category import,
the category relation, and the old article index. Rename the text column to
`design` and retain an index on it. Keep all other item columns and relations.

- [ ] **Step 4: Write the migration in dependency-safe order.**

The SQL must:

```sql
CREATE TABLE "item_article_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "article_number" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "item_article_numbers_item_id_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_item_article_numbers_value"
  ON "item_article_numbers" ("article_number");
CREATE INDEX "idx_item_article_numbers_item"
  ON "item_article_numbers" ("item_id");

DO $$
BEGIN
  IF EXISTS (
    SELECT upper(trim("article_number"))
    FROM "items"
    GROUP BY upper(trim("article_number"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: article-number collision after normalization';
  END IF;
END $$;

-- Copy before dropping the source column.
INSERT INTO "item_article_numbers" ("item_id", "article_number")
SELECT "id", upper(trim("article_number")) FROM "items";

ALTER TABLE "items" RENAME COLUMN "category" TO "design";
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_category_id_item_categories_id_fk";
ALTER TABLE "items" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "items" DROP COLUMN "article_number";
DROP TABLE IF EXISTS "item_categories";
```

Before the insert, use a collision assertion that raises if two existing
values normalize to the same article number. Preserve the existing item UUIDs
and all historical references. Drop or recreate indexes in the same migration
so no stale `idx_items_article` or category FK remains.

- [ ] **Step 5: Update seed data and schema exports.**

Seed items with `design` and an inserted child article-number row. Remove item
category seed/setup only; do not remove accounting category setup.

- [ ] **Step 6: Run the schema/type tests.**

Run:

```bash
pnpm typecheck
pnpm vitest run src/lib/items/article-number.test.ts
```

Expected: normalization tests pass; integration tests remain RED until the
server query layer is updated.

## Task 3: Implement server input validation, item CRUD, and article-number APIs

**Files:**
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/server/functions/items/items.ts`
- Delete: `src/server/functions/items/categories.server.ts`
- Delete: `src/server/functions/items/categories.ts`

- [ ] **Step 1: Replace the Zod input contract.**

Use:

```ts
const articleNumbersInput = z
  .array(z.string().trim().min(1).max(64))
  .min(1)

export const upsertInput = z.object({
  name: z.string().trim().min(1).max(120),
  design: z.string().trim().min(1).max(64),
  articleNumbers: articleNumbersInput,
  description: z.string().max(1000).optional(),
  supplierId: z.uuid().optional(),
  costPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  costCurrency: z.enum(['RMB', 'USD', 'UGX']).optional(),
  sizes: z.array(z.string().trim().min(1).max(16)).default([]),
  colors: z.array(colorInput).default([]),
  minimumSellPriceUgx: z.string().regex(/^\d+(\.\d{1,2})?$/).refine((v) => Number(v) > 0, 'Minimum sell price must be positive').optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
})
```

Create an update schema that makes item fields optional but does not require
article numbers on every item-field patch. Article-number add/remove requests
must validate UUIDs and article-number row ownership.

- [ ] **Step 2: Add a transaction-safe normalization and uniqueness helper.**

Normalize all submitted values, reject duplicates within the request before
writing, query existing rows for conflicts, and catch PostgreSQL unique
constraint violations to return `Article number already belongs to another item`.
Do not make the pre-check the only protection against concurrent writes.

- [ ] **Step 3: Update create and update queries.**

Create the item with `design`, insert all normalized article-number rows in the
same transaction, materialize colors/sizes as before, and return the item with
its complete article-number collection. Update item-level fields only; remove
all category/article-number column updates.

- [ ] **Step 4: Add focused article-number server functions.**

Export and wrap:

```ts
export async function addItemArticleNumberQuery(input: {
  itemId: string
  articleNumber: string
})

export async function removeItemArticleNumberQuery(input: {
  itemId: string
  articleNumberId: string
})

export async function replaceItemArticleNumbersQuery(input: {
  itemId: string
  articleNumbers: string[]
})
```

All three require admin/supervisor authorization through server-function wrappers.
The remove query must count the item's rows inside the same transaction and
reject a count of one. The replacement query must normalize the complete
desired collection, reject duplicates, verify the collection is non-empty, and
delete/insert the diff in one database transaction so an edit containing
several additions/removals cannot leave a partially updated collection. The
editor uses the replacement operation; add/remove wrappers remain available
for focused detail-page actions.

- [ ] **Step 5: Rewrite list, search, and article lookup queries.**

Hydrate `articleNumbers` in `ITEM_DETAIL_WITH`. `getItemByArticleQuery` joins
through `item_article_numbers` after normalizing the input. `searchItemsQuery`
uses `ilike(itemArticleNumbers.articleNumber, like)` OR `ilike(items.name, like)`
and returns each parent once. Replace article-number ordering with stable
`items.name` plus `items.id` ordering.

- [ ] **Step 6: Remove item-category APIs and run the RED/GREEN cycle.**

Run the focused integration tests from Task 1. First verify they fail for a
real implementation reason before the server changes, then run:

```bash
pnpm vitest run src/__tests__/items-article-numbers.test.ts src/lib/items/article-number.test.ts
```

Expected: all article-number contract tests pass.

## Task 4: Replace the item editor and detail-page category UI

**Files:**
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/routes/items/$articleNumber.tsx`
- Create: `src/components/items/design-edit-popover.tsx`
- Delete: `src/components/items/category-edit-popover.tsx`
- Modify: `src/components/items/item-picker.tsx`
- Modify: `src/components/items/item-card.tsx`
- Modify: `src/components/items/items-page-content.tsx`
- Modify: `src/routes/items/new.tsx`

- [ ] **Step 1: Add component tests for the new editor contract.**

Update `src/__tests__/item-editor-validation.test.tsx` to assert a required
Design field, an addable article-number control, visible article-number chips,
removal of a non-final number, and disabled submission when no article number
has been added. Add a conflict-error assertion using the server error shape.

- [ ] **Step 2: Replace editor state and submission payloads.**

Replace `articleNumber`/`category` state with `articleNumbers` and `design`.
Use a draft input plus an `Add article number` action and Enter handling. On
create, submit all chips. On edit, retain the original collection in a ref,
derive `added = current - original` and `removed = original - current`, and
call `replaceItemArticleNumbers` once after validating the item-level fields.
If either the item update or replacement fails, show the error and invalidate
the route so the server state is authoritative; never report a successful save
while the collection is only partially persisted.

The visible examples must be:

```tsx
<FieldLabel help="item.design">Design</FieldLabel>
<Input placeholder="Round neck" value={design} ... />
<FieldLabel help="item.articleNumbers">Article numbers</FieldLabel>
<Input placeholder="Enter an article number" ... />
```

Remove the category combobox, category options prop, and automatic category-
based article-number suggestion. The item name placeholder should use
`T-shirt`.

- [ ] **Step 3: Update the detail route to resolve and display collections.**

Remove `listItemCategories` from the loader. Display the complete article-
number list, use the design edit popover, and pass an article-number array to
the audit panel or shared label resolver. Keep the existing route parameter so
bookmarked `/items/$articleNumber` URLs continue to work.

- [ ] **Step 4: Update item cards, list rows, pickers, and create navigation.**

Use `articleNumbers[0]` only for a compatibility navigation target and display
all values where space allows. Search labels must include all article numbers
so any matching number is visibly associated with the same item. Update
`ItemSummary` to expose `design` and `articleNumbers` and remove the old
singular/category fields.

- [ ] **Step 5: Run component tests and typecheck.**

Run:

```bash
pnpm vitest run src/__tests__/item-editor-validation.test.tsx
pnpm typecheck
```

## Task 5: Refactor all server and UI consumers of singular article numbers/category

**Files:**
- Modify: `src/server/functions/supply/items.ts`
- Modify: `src/server/functions/supply/items-internals.ts`
- Modify: `src/server/functions/store/receiving.ts`
- Modify: `src/server/functions/store/transfers.ts`
- Modify: `src/server/functions/store/returns.ts`
- Modify: `src/server/functions/store/specify.ts`
- Modify: `src/server/functions/store/requisitions.ts`
- Modify: `src/server/scheduled/send-low-stock-digest.ts`
- Modify: `src/server/scheduled/run-threshold-checks.ts`
- Modify: `src/server/audit/article-numbers.ts`
- Modify: `src/components/supply/add-item-form.tsx`
- Modify: `src/components/supply/supply-route-wizard.tsx`
- Modify: `src/components/supply/split-item-form.tsx`
- Modify: `src/components/supply/supply-route-item-picker.tsx`
- Modify: `src/routes/store/index.tsx`
- Modify: `src/routes/store/receiving.tsx`
- Modify: `src/routes/store/transfers.tsx`
- Modify: `src/routes/shop/index.tsx`
- Modify: `src/routes/shop/sales.tsx`
- Modify: `src/lib/help-dictionary.ts`
- Modify: all affected tests and fixtures under `src/__tests__` and `src/lib/**/__tests__`

- [ ] **Step 1: Introduce one shared current-label helper.**

Add `formatItemArticleNumbers(articleNumbers)` beside the item helpers. It
must return `articleNumbers.map((n) => n.articleNumber).join(', ')`, or `?`
when the collection is empty. Historical snapshot renderers continue to use
their stored snapshot value.

- [ ] **Step 2: Update supply-route creation and editing.**

When a selected item is used in a new route line, retain the article number
entered or used to select it as `articleNumberSnapshot`; if the flow has only a
parent item, use the first normalized article number. Never write an article
number back to `items`. Existing route-line snapshots remain unchanged during
edit/review.

- [ ] **Step 3: Update receiving, store/shop labels, notifications, and audit resolution.**

Replace every `item.articleNumber` access with the collection helper or an
explicit historical snapshot. `resolveArticleNumbersForAudit` must return all
current article numbers for an item while preserving snapshot-first behavior
for historical rows.

- [ ] **Step 4: Replace catalog category reads with design reads.**

Update stock tables, item cards, pickers, labels, help text, and test fixtures
to use `design`. Remove only item-category code; leave `expense.category`,
accounting categories, and route-expense categories unchanged.

- [ ] **Step 5: Prove no stale catalog references remain.**

Run:

```bash
rg -n "item\.articleNumber|product\.articleNumber|item\.category|product\.category|items\.articleNumber|items\.category|listItemCategories|itemCategories|categoryId" src --glob '!**/accounting/**'
```

Expected: no catalog references remain. Any match must be reviewed individually
to distinguish unrelated accounting/expense categories from stale catalog
code.

## Task 6: Update fixtures, migration coverage, and end-to-end behavior

**Files:**
- Modify: `src/__tests__/test-helpers.ts`
- Modify: all item-related tests discovered by the stale-reference scan
- Create or modify: `cypress/e2e/items.cy.ts`
- Modify: `cypress/support/cleanup.ts`
- Modify: `drizzle/meta/0014_snapshot.json`

- [ ] **Step 1: Update the common item fixture.**

The fixture helper must accept `design` and `articleNumbers`, insert the parent
item, then insert child rows. It must not silently create a category row or
populate `items.article_number`.

- [ ] **Step 2: Add migration/backfill coverage.**

Use a test fixture containing two items with known UUIDs, category values, and
article numbers. Apply the migration and assert the UUIDs, design values, and
child article-number rows are preserved. Include a case-normalization collision
that aborts before the old column is dropped.

- [ ] **Step 3: Add the Cypress primary flow.**

The E2E test creates `T-shirt` / `Round neck` with `TS-001` and `TS-002`,
searches by `TS-002`, opens the parent item, adds `TS-003`, attempts to reuse
an existing number, and verifies the conflict appears inline. It also asserts
the same item-level supplier cost and minimum selling price are shown.

- [ ] **Step 4: Run focused unit/component/integration tests.**

Run:

```bash
pnpm vitest run src/lib/items/article-number.test.ts src/__tests__/items-article-numbers.test.ts src/__tests__/item-editor-validation.test.tsx
```

- [ ] **Step 5: Run the E2E flow against the test database.**

Run:

```bash
pnpm db:push:test
pnpm test:e2e -- --spec cypress/e2e/items.cy.ts
```

## Task 7: Adversarial implementation review and full verification

**Files:**
- Modify any implementation/test files exposed by the review
- Modify: `docs/superpowers/plans/2026-08-18-item-design-and-article-numbers.md` if the plan discovers a missing requirement

- [ ] **Step 1: Review the implementation against every plan-wide invariant.**

Inspect the migration SQL, Drizzle schema, server transactions, route
loaders, editor state, and all consumer labels. Specifically challenge:

- case-only duplicate article numbers;
- duplicate values in one request;
- archived-item reuse;
- concurrent inserts and unique-constraint error mapping;
- deleting the final article number;
- an item that has historical stock/sales but no current label;
- route/supply flows that previously depended on a singular article number;
- accidental changes to accounting/expense category fields;
- migration ordering and stale Drizzle metadata;
- every old `articleNumber`/`category` property access.

- [ ] **Step 2: Add a regression test for every issue found, run it RED, then fix the implementation.**

No review finding may be fixed only by editing the implementation. Each finding
must have a focused regression test that fails before the fix and passes after
it.

- [ ] **Step 3: Run all verification commands.**

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm vitest run
pnpm build
```

Run the item E2E flow again after the full suite. Read all output and record
the exit code for each command.

- [ ] **Step 4: Perform the final requirements audit.**

Confirm from current files and command output that:

1. Category is removed from the item model and design is required.
2. Multiple article numbers can be created and added later.
3. Article numbers are normalized and globally unique.
4. Search by any article number returns the same item.
5. Item-level pricing remains shared.
6. Existing UUIDs and historical references survive migration.
7. Colors, sizes, supplier, description, cost, minimum price, and low-stock
   settings remain available.
8. Tests, typecheck, lint, formatting, build, and E2E verification pass.

- [ ] **Step 5: Commit the completed implementation after fresh verification.**

```bash
git add src drizzle cypress docs/superpowers/plans/2026-08-18-item-design-and-article-numbers.md
git commit -m "feat: support multiple article numbers per item"
```
