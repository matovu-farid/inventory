# Items Free-Text Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `item_categories` table + FK + admin settings page with a free-text `category` column on `items`, edited via a creatable combobox; surface server errors in the create-item dialog instead of swallowing them.

**Architecture:** One SQL migration drops the FK/table and adds a `text NOT NULL` column. A new `listItemCategories` server fn returns `SELECT DISTINCT category FROM items ORDER BY category` to power the combobox. A new `CreatableCombobox` component (built on the same `Command` + `Popover` primitives as the existing `Combobox`) shows existing categories and adds a "Create '<input>'" row when the typed value isn't in the list. The create-item dialog gains a `try/catch` with an inline destructive-color message, matching the pattern in `opening-balance-form.tsx`. The item detail page gets an inline pencil-edit popover for the category.

**Tech Stack:** TanStack Start (server fns), Drizzle ORM + Postgres, TanStack Router (loaders), React + shadcn/ui (Command, Popover), Vitest + Cypress.

**Spec:** `docs/superpowers/specs/2026-05-31-items-free-text-category-design.md`

---

## Task 1: Schema migration — TS schema + SQL + apply

**Files:**
- Modify: `src/db/schema/items.ts`
- Modify: `src/db/schema/index.ts`
- Delete: `src/db/schema/item-categories.ts`
- Create: `drizzle/0018_items_category_text.sql`

This is a destructive DB change. There are zero rows in `items` and zero in `item_categories` (verified during root-cause investigation in this session), so no backfill is needed.

- [ ] **Step 1: Update `src/db/schema/items.ts`**

Replace the file with:

```ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
// `variants` is imported only as a relation target — the cyclical pairing
// (variants → items → variants) is harmless because Drizzle's `relations()`
// helper resolves lazily at first query.
import { variants } from "./variants"

/**
 * Catalog: items and item_colors. After the items-free-text-category change
 * (drizzle/0018_items_category_text.sql) categories live as a plain text
 * column here instead of an FK to a separate table — the combobox in
 * item-editor.tsx autocompletes from existing values.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleNumber: text("article_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Free-text catalog grouping. NOT NULL — every item has a category.
     * The set of categories on the system is implicit in the distinct
     * values of this column; the UI combobox sources its options from
     * `listItemCategories()`.
     */
    category: text("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_items_article").on(table.articleNumber),
    index("idx_items_category").on(table.category),
  ],
)

export const itemColors = pgTable(
  "item_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    imageS3Key: text("image_s3_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_ic_item").on(table.itemId),
    index("idx_ic_unique").on(table.itemId, table.colorName),
  ],
)

export const itemRelations = relations(items, ({ many }) => ({
  colors: many(itemColors),
  // `variants` (one row per item × color × size) was added in #2 and is
  // now the unit of stock since #4 / #5 / #6.
  variants: many(variants),
}))

export const itemColorRelations = relations(itemColors, ({ one }) => ({
  item: one(items, {
    fields: [itemColors.itemId],
    references: [items.id],
  }),
}))
```

- [ ] **Step 2: Drop the item-categories schema export**

Edit `src/db/schema/index.ts`:

```diff
-export * from './item-categories'
```

- [ ] **Step 3: Delete the item-categories schema file**

```bash
rm src/db/schema/item-categories.ts
```

- [ ] **Step 4: Write the migration SQL**

Create `drizzle/0018_items_category_text.sql`:

```sql
-- Items free-text category — replaces the items.item_category_id FK and
-- drops the item_categories table.
--
-- Safe because the system is greenfield: zero rows in items and zero in
-- item_categories at the time of this migration. If you're applying this
-- to a non-empty DB you MUST first run:
--   ALTER TABLE items ADD COLUMN category text;
--   UPDATE items SET category = ic.name
--     FROM item_categories ic WHERE items.item_category_id = ic.id;
--   ALTER TABLE items ALTER COLUMN category SET NOT NULL;
-- before running the DROPs below.
--
-- This repo uses drizzle-kit push, so src/db/schema/items.ts is the
-- source of truth — this file is the human-readable record of the DDL.

ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_item_category_id_item_categories_id_fk";
DROP INDEX IF EXISTS "idx_items_category";
ALTER TABLE "items" DROP COLUMN IF EXISTS "item_category_id";
ALTER TABLE "items" ADD COLUMN "category" text NOT NULL;
CREATE INDEX "idx_items_category" ON "items" ("category");
DROP TABLE IF EXISTS "item_categories";
```

- [ ] **Step 5: Apply the migration**

Run:

```bash
pnpm dotenv -e .env.local -- psql "$DATABASE_URL" -f drizzle/0018_items_category_text.sql
```

If `psql` isn't available, use a node one-liner:

```bash
node -e '
require("dotenv").config({path:".env.local"});
const {Pool} = require("pg");
const fs = require("fs");
const sql = fs.readFileSync("drizzle/0018_items_category_text.sql","utf8");
const p = new Pool({connectionString: process.env.DATABASE_URL});
p.query(sql).then(() => { console.log("OK"); p.end(); })
 .catch(e => { console.error(e.message); process.exit(1); });
'
```

Expected output: `OK` (or psql's `ALTER TABLE` / `DROP TABLE` lines).

- [ ] **Step 6: Verify schema state**

```bash
node -e '
require("dotenv").config({path:".env.local"});
const {Pool} = require("pg");
const p = new Pool({connectionString: process.env.DATABASE_URL});
(async () => {
  const cols = await p.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name=\$1 ORDER BY ordinal_position`, ["items"]);
  console.log("items columns:", cols.rows);
  const t = await p.query(`SELECT to_regclass(\$1) AS r`, ["public.item_categories"]);
  console.log("item_categories table:", t.rows[0].r);
  await p.end();
})();
'
```

Expected: `items` has a `category text NO` (not null) row; `item_categories table: null`.

- [ ] **Step 7: Verify drizzle-kit push is in sync**

```bash
pnpm db:push
```

Expected: `No schema changes, nothing to migrate` (or a no-op summary).

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/items.ts src/db/schema/index.ts drizzle/0018_items_category_text.sql
git rm src/db/schema/item-categories.ts
git commit -m "refactor(schema): items.category text column replaces item_categories FK"
```

---

## Task 2: Update seed.ts to write category text

**Files:**
- Modify: `src/db/seed.ts`

- [ ] **Step 1: Drop the item-categories seed block and FK lookup**

Edit `src/db/seed.ts`:

1. Remove `itemCategories` from the destructured imports at line 5–17:

```diff
 import {
   items,
   itemColors,
-  itemCategories,
   suppliers,
   stores,
   shops,
```

2. Delete the "Item categories" block at lines 78–86 (the `INSERT INTO item_categories` and the `console.log`).

3. Delete the `uncategorizedRow` lookup block at lines 150–158:

```diff
-    // items.item_category_id is NOT NULL — point newly-seeded items at
-    // the seeded "Uncategorized" bucket created above.
-    const uncategorizedRow = await db.query.itemCategories.findFirst({
-      where: eq(itemCategories.name, "Uncategorized"),
-    })
-    if (!uncategorizedRow) {
-      throw new Error('Missing seed "Uncategorized" item category')
-    }
-    const uncategorized: { id: string } = uncategorizedRow
```

4. Update `upsertProduct` to write `category` instead of `itemCategoryId` (around lines 174–180):

```diff
       const [created] = await db
         .insert(items)
         .values({
           articleNumber: args.articleNumber,
           name: args.name,
-          itemCategoryId: uncategorized.id,
+          category: "Uncategorized",
         })
         .returning()
```

- [ ] **Step 2: Run the seed to verify it still works**

```bash
pnpm db:seed
```

Expected: completes with the usual "Seeding ..." lines and no errors. (The "Seeding item categories..." line is gone — that's correct.)

- [ ] **Step 3: Verify seeded items have a category**

```bash
node -e '
require("dotenv").config({path:".env.local"});
const {Pool} = require("pg");
const p = new Pool({connectionString: process.env.DATABASE_URL});
(async () => {
  const r = await p.query(`SELECT article_number, category FROM items ORDER BY article_number LIMIT 5`);
  console.log(r.rows);
  await p.end();
})();
'
```

Expected: rows with `category: 'Uncategorized'`.

- [ ] **Step 4: Commit**

```bash
git add src/db/seed.ts
git commit -m "chore(seed): write items.category text instead of item_categories FK"
```

---

## Task 3: Server — update items.ts (createItem, updateItem, listItemCategories) — TDD

**Files:**
- Modify: `src/server/functions/items/items.ts`
- Modify: `src/__tests__/create-item-materializes-variants.test.ts`
- Create: `src/__tests__/list-item-categories.test.ts`

- [ ] **Step 1: Write the failing test for `listItemCategories`**

Create `src/__tests__/list-item-categories.test.ts`:

```ts
/**
 * listItemCategories returns the distinct sorted set of category values
 * actually in use on items — used by the create-item combobox to surface
 * existing categories.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { inArray } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import { items } from '#/db/schema'
import {
  createItem,
  listItemCategories,
} from '#/server/functions/items/items'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000d1'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({ user: { id: TEST_USER_ID, role: 'admin' } }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
}))

const stubStartContext = {
  getRouter: (() => {
    throw new Error('router not available in tests')
  }) as never,
  request: new Request('http://localhost/test'),
  startOptions: { functionMiddleware: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: 'serverFn' as const,
}
function callServerFn<T>(fn: () => Promise<T>): Promise<T> {
  return runWithStartContext(stubStartContext, fn)
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createdItemIds: string[] = []

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
})

describe('listItemCategories', () => {
  beforeAll(async () => {
    for (const [an, cat] of [
      [`lic-${SUFFIX}-1`, `lic-${SUFFIX}-Shoes`],
      [`lic-${SUFFIX}-2`, `lic-${SUFFIX}-Bags`],
      [`lic-${SUFFIX}-3`, `lic-${SUFFIX}-Shoes`],
    ] as const) {
      await callServerFn(() =>
        createItem({
          data: {
            articleNumber: an,
            name: an,
            category: cat,
            sizes: [],
            colors: [],
          },
        }),
      )
    }
    const created = await db.query.items.findMany({
      where: (it, { like }) => like(it.articleNumber, `lic-${SUFFIX}-%`),
    })
    for (const c of created) createdItemIds.push(c.id)
  })

  it('returns distinct categories sorted ascending', async () => {
    const cats = await callServerFn(() => listItemCategories())
    const ours = cats.filter((c) => c.startsWith(`lic-${SUFFIX}-`))
    expect(ours).toEqual([`lic-${SUFFIX}-Bags`, `lic-${SUFFIX}-Shoes`])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm vitest run src/__tests__/list-item-categories.test.ts
```

Expected: FAIL — either `listItemCategories` is not exported from `items/items.ts`, or `createItem` rejects because `category` is an unknown input.

- [ ] **Step 3: Update `src/server/functions/items/items.ts`**

Replace the file with:

```ts
import { createServerFn } from "@tanstack/react-start"
import { asc, eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { items, itemColors, variants } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { materializeVariantsFromColorsSizes } from "./variants-materialize"

const colorInput = z.object({
  colorName: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  /**
   * Free-text catalog grouping. Required on create; the combobox in
   * item-editor.tsx populates this from `listItemCategories()` or accepts
   * a brand new value typed by the user.
   */
  category: z.string().trim().min(1).max(64),
  // Sizes are no longer persisted on items (issue #7 drops items.sizes).
  // The caller still passes them on create so the server can materialize
  // the (colors × sizes) cross product into the variants table.
  sizes: z.array(z.string().min(1).max(16)).default([]),
  colors: z.array(colorInput).default([]),
})

// Item-detail queries hydrate the variants list so UI flows that pick a
// (color, size) cell — opening balance, supply route editor — can map that
// pair back to a `variantId` client-side.
const ITEM_DETAIL_WITH = {
  colors: true,
  variants: {
    columns: { id: true, colorId: true, size: true },
  },
} as const

export const listItems = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  return db.query.items.findMany({
    with: ITEM_DETAIL_WITH,
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
})

export const getItemByArticle = createServerFn()
  .inputValidator(z.object({ articleNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return db.query.items.findFirst({
      where: eq(items.articleNumber, data.articleNumber),
      with: ITEM_DETAIL_WITH,
    })
  })

export const searchItems = createServerFn()
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    if (!data.query.trim()) {
      return db.query.items.findMany({ with: ITEM_DETAIL_WITH, limit: 20 })
    }
    const like = `%${data.query}%`
    return db.query.items.findMany({
      where: or(ilike(items.articleNumber, like), ilike(items.name, like)),
      with: ITEM_DETAIL_WITH,
      limit: 20,
    })
  })

/**
 * Returns the distinct set of category values currently in use on items,
 * sorted ascending. Powers the create-item / detail-edit combobox.
 */
export const listItemCategories = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  const rows = await db
    .selectDistinct({ category: items.category })
    .from(items)
    .orderBy(asc(items.category))
  return rows.map((r) => r.category)
})

export const createItem = createServerFn()
  .inputValidator(upsertInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db
      .insert(items)
      .values({
        articleNumber: data.articleNumber,
        name: data.name,
        description: data.description,
        category: data.category,
      })
      .returning()

    // If the caller supplied colors, insert them now. If sizes were also
    // supplied, materialize the (color × size) cross product into the
    // variants table — that's how sizes are stored after #7 dropped the
    // items.sizes column.
    if (data.colors.length > 0) {
      const insertedColors = await db
        .insert(itemColors)
        .values(
          data.colors.map((c) => ({
            itemId: row.id,
            colorName: c.colorName,
            colorHex: c.colorHex,
          })),
        )
        .returning()
      if (data.sizes.length > 0) {
        await materializeVariantsFromColorsSizes({
          itemId: row.id,
          colorIds: insertedColors.map((c) => c.id),
          sizes: data.sizes,
        })
      }
    }
    return row
  })

export const updateItem = createServerFn()
  .inputValidator(
    upsertInput
      .extend({ id: z.uuid() })
      // On update, sizes/colors are managed independently through the
      // variant + color endpoints; ignore them here so callers don't have
      // to send the full payload. Category may be patched.
      .partial({ sizes: true, colors: true, category: true }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, category, sizes: _sizes, colors: _colors, ...fields } = data
    void _sizes
    void _colors
    const patch = {
      articleNumber: fields.articleNumber,
      name: fields.name,
      description: fields.description,
      ...(category === undefined ? {} : { category }),
    }
    const [row] = await db.update(items).set(patch).where(eq(items.id, id)).returning()
    return row
  })

/**
 * Lists the sizes currently materialized for an item by reading the
 * variants table. Returns the unique set of sizes (preserves the
 * insertion order); the UI sorts via deriveSizes() for display.
 */
export const listItemSizes = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const rows = await db
      .select({ size: variants.size })
      .from(variants)
      .where(eq(variants.itemId, data.itemId))
    const seen = new Set<string>()
    for (const r of rows) seen.add(r.size)
    return [...seen]
  })
```

- [ ] **Step 4: Update `src/__tests__/create-item-materializes-variants.test.ts`**

Edit the two `createItem({ data: {...} })` calls (around line 76 and line 113) to include `category`:

For the first call (line 76):

```diff
       createItem({
         data: {
           articleNumber,
           name: 'Materialize tester',
+          category: 'Test',
           sizes: ['S', 'M', 'L'],
           colors: [
             { colorName: 'Indigo', colorHex: '#2a3a8b' },
             { colorName: 'Crimson', colorHex: '#a01b1b' },
           ],
         },
       }),
```

For the second call (line 113):

```diff
       createItem({
         data: {
           articleNumber,
           name: 'Materialize tester B',
+          category: 'Test',
           sizes: [],
           colors: [],
         },
       }),
```

The test file imports `itemCategories` for its `uncategorizedId()` helper — that helper and the import are no longer needed. Delete:

- The `itemCategories` import on line 18 (just remove it from the destructured import list).
- The `uncategorizedId()` function and `beforeAll(() => uncategorizedId())` block (lines 49–60).

- [ ] **Step 5: Run both tests**

```bash
pnpm vitest run src/__tests__/list-item-categories.test.ts src/__tests__/create-item-materializes-variants.test.ts
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/items/items.ts src/__tests__/list-item-categories.test.ts src/__tests__/create-item-materializes-variants.test.ts
git commit -m "feat(items): category text column + listItemCategories server fn"
```

---

## Task 4: Delete admin item-categories server fns + drop permission

**Files:**
- Delete: `src/server/functions/admin/item-categories.ts`
- Delete: `src/server/functions/admin/item-categories.server.ts`
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Delete the admin server fn files**

```bash
rm src/server/functions/admin/item-categories.ts
rm src/server/functions/admin/item-categories.server.ts
```

- [ ] **Step 2: Remove `itemCategories.manage` from `permissions.ts`**

Edit `src/lib/permissions.ts`:

1. Remove the union member at line 36:

```diff
   | "audit.view"
   | "audit.viewArticleActivity"
-  | "itemCategories.manage"
```

2. Remove from the `admin` role permission list at line 59:

```diff
     "audit.view",
     "audit.viewArticleActivity",
-    "itemCategories.manage",
   ],
```

3. Remove from the `PERMISSION_SERVER_GATES` map at line 128:

```diff
   "audit.viewArticleActivity": ["src/server/functions/audit/list-by-article.ts"],
-  "itemCategories.manage": ["src/server/functions/admin/item-categories.ts"],
 }
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If anything still imports the deleted files, fix the call sites — but the only known consumer is `src/routes/settings/categories.tsx`, which Task 6 deletes. If tsc complains about it now, proceed to Task 6 first then return.

- [ ] **Step 4: Commit**

```bash
git rm src/server/functions/admin/item-categories.ts src/server/functions/admin/item-categories.server.ts
git add src/lib/permissions.ts
git commit -m "refactor: drop item_categories admin server fns + itemCategories.manage permission"
```

---

## Task 5: Delete the settings/categories route

**Files:**
- Delete: `src/routes/settings/categories.tsx`
- Auto-regenerated: `src/routeTree.gen.ts`

- [ ] **Step 1: Delete the route file**

```bash
rm src/routes/settings/categories.tsx
```

- [ ] **Step 2: Regenerate the route tree**

The dev server regenerates `src/routeTree.gen.ts` on next start. Trigger a fresh generation:

```bash
pnpm dev &
DEV_PID=$!
sleep 8
kill $DEV_PID 2>/dev/null
```

Then verify `/settings/categories` is gone from the generated tree:

```bash
grep -c "settings/categories" src/routeTree.gen.ts
```

Expected: `0`.

If `pnpm dev` doesn't regenerate on its own here, run the explicit generator (TanStack Router CLI is in dev deps):

```bash
pnpm tsr generate
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git rm src/routes/settings/categories.tsx
git add src/routeTree.gen.ts
git commit -m "refactor(routes): drop /settings/categories admin page"
```

---

## Task 6: Update backend tests that reference item_categories

**Files (each will be modified):**
- `src/__tests__/materialize-variants.test.ts`
- `src/__tests__/variants.test.ts`
- `src/__tests__/delete-variant.test.ts`
- `src/__tests__/photo-handoff.test.ts`
- `src/__tests__/products-server.test.ts`
- `src/__tests__/items-rename.test.ts`
- `src/__tests__/receiving-backdate.test.ts`
- `src/__tests__/server-variant-id.test.ts`
- `src/__tests__/audit-article-resolver.test.ts`
- `src/__tests__/shift-reports.test.ts`
- `src/__tests__/stock-variant-id.test.ts`
- `src/__tests__/cleanup-fk.test.ts`
- `src/__tests__/notifications-variant-id.test.ts`
- `src/__tests__/low-stock-flow.test.ts`
- `src/__tests__/opening-balance-variants.test.ts`
- `src/lib/notifications/__tests__/baseline.test.ts`
- Delete: `src/__tests__/item-categories.test.ts`

Each test file follows the same migration pattern. Apply the changes uniformly.

- [ ] **Step 1: Migrate one file as a template — `materialize-variants.test.ts`**

In each affected file, do the following:

1. Remove `itemCategories` from the schema imports:

```diff
-import { items, itemColors, itemCategories, variants } from '#/db/schema'
+import { items, itemColors, variants } from '#/db/schema'
```

2. Delete any helper that resolves an "Uncategorized" id (typically named `uncategorizedId()` or inlined as `db.query.itemCategories.findFirst({ where: eq(itemCategories.name, 'Uncategorized') })`). Also delete the `beforeAll` block that calls it if its only purpose was to touch that seed row.

3. Every `db.insert(items).values({ ... itemCategoryId: uncat, ... })` (or `uncat.id`) becomes `category: 'Test'`:

```diff
       .values({
         articleNumber: '...',
         name: '...',
-        itemCategoryId: uncat,
+        category: 'Test',
       })
```

- [ ] **Step 2: Apply the same pattern to the rest of the backend test files**

For each file in the list above, run the same three edits. Some files import `itemCategories` only for the `findFirst` lookup — once the lookup is gone, the import is unused; tsc will flag it.

If a file inserts items with `category: 'X'` already and only needs the `itemCategoryId` removal, just delete that field; the other fields stay.

- [ ] **Step 3: Delete `src/__tests__/item-categories.test.ts`**

```bash
rm src/__tests__/item-categories.test.ts
```

- [ ] **Step 4: Type-check and run the full backend test suite**

```bash
pnpm tsc --noEmit
pnpm vitest run
```

Expected: tsc clean, vitest all green.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__ src/lib/notifications/__tests__/baseline.test.ts
git rm src/__tests__/item-categories.test.ts
git commit -m "test: migrate tests off item_categories FK to items.category text"
```

---

## Task 7: Create the `CreatableCombobox` UI component

**Files:**
- Create: `src/components/ui/creatable-combobox.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ui/creatable-combobox.tsx`:

```tsx
import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"

import { cn } from "#/lib/utils"
import { Button } from "#/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"

interface CreatableComboboxProps {
  options: ReadonlyArray<string>
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: React.ReactNode
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean
  className?: string
  triggerClassName?: string
}

/**
 * Combobox variant that lets the user pick an existing option OR type a
 * new one and add it on the spot. When the typed query doesn't match any
 * option (case-insensitive, trimmed), a "Create '<query>'" row appears
 * at the top of the list — selecting it calls onChange(query.trim()).
 *
 * Built on the same Command + Popover primitives as ./combobox.tsx so
 * the visual treatment matches.
 */
function CreatableCombobox({
  options,
  value,
  onChange,
  placeholder = "Select or create...",
  searchPlaceholder = "Search or type to create...",
  emptyMessage = "No matches.",
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  className,
  triggerClassName,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const trimmed = query.trim()
  const exactMatch = options.some(
    (o) => o.toLowerCase() === trimmed.toLowerCase(),
  )
  const showCreate = trimmed.length > 0 && !exactMatch

  function select(next: string) {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid || undefined}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {value || placeholder}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-(--radix-popover-trigger-width) p-0", className)}
        align="start"
      >
        <Command
          // Always include the synthetic "create" row in the filtered list
          // even when query doesn't match any option — cmdk would otherwise
          // hide everything and show CommandEmpty instead.
          filter={(itemValue, search) => {
            if (itemValue === "__create__") return 1
            return itemValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {showCreate && (
                <CommandItem
                  key="__create__"
                  value="__create__"
                  onSelect={() => select(trimmed)}
                >
                  <PlusIcon className="mr-2 size-4" />
                  Create &ldquo;{trimmed}&rdquo;
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => select(option)}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { CreatableCombobox }
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/creatable-combobox.tsx
git commit -m "feat(ui): add CreatableCombobox component"
```

---

## Task 8: Wire combobox + inline error into item-editor.tsx

**Files:**
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/routes/items/index.tsx`
- Modify: `src/lib/help-dictionary.ts` (add InfoTip entry — see [[feedback_info_tips]] in memory)

- [ ] **Step 1: Have the route loader fetch categories**

Edit `src/routes/items/index.tsx`. Update the imports and loader:

```diff
-import { listItems, searchItems } from "#/server/functions/items/items"
+import {
+  listItemCategories,
+  listItems,
+  searchItems,
+} from "#/server/functions/items/items"
 import { ItemCard } from "#/components/items/item-card"
 import { ItemEditor } from "#/components/items/item-editor"
```

And:

```diff
 export const Route = createFileRoute("/items/")({
   beforeLoad: ({ context }) => requireUiPermission(context, "items.view"),
-  loader: async () => ({ products: await listItems() }),
+  loader: async () => {
+    const [products, categories] = await Promise.all([
+      listItems(),
+      listItemCategories(),
+    ])
+    return { products, categories }
+  },
   component: ProductsPage,
 })
```

Pull the loader data and pass it down:

```diff
 function ProductsPage() {
-  const { products: initial } = Route.useLoaderData()
+  const { products: initial, categories } = Route.useLoaderData()
   const router = useRouter()
```

Pass to the editor in the dialog:

```diff
           <ItemEditor
+            categories={categories}
             onCreated={() => {
               setEditorOpen(false)
               void refreshList()
             }}
           />
```

- [ ] **Step 2: Rewrite `item-editor.tsx`**

Replace the file with:

```tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
import { CreatableCombobox } from "#/components/ui/creatable-combobox"
import { X } from "lucide-react"
import { createItem } from "#/server/functions/items/items"
import { HexColorField } from "./hex-color-field"

const SIZE_QUICK_PICKS = ["XS", "S", "M", "L", "XL", "XXL"]

interface Props {
  categories: ReadonlyArray<string>
  onCreated: (itemId: string, articleNumber: string) => void
}

interface ColorDraft {
  colorName: string
  colorHex: string
}

/**
 * Item create form. Sizes are not persisted on items (issue #7 dropped
 * items.sizes); the server materializes the (color × size) cross-product
 * into the variants table when saving. Category is a free-text column on
 * items — the CreatableCombobox lets the user pick from existing values
 * or type a brand-new one.
 */
export function ItemEditor({ categories, onCreated }: Props) {
  const [articleNumber, setArticleNumber] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [sizes, setSizes] = useState<string[]>([])
  const [sizeDraft, setSizeDraft] = useState("")
  const [colors, setColors] = useState<ColorDraft[]>([])
  const [colorNameDraft, setColorNameDraft] = useState("")
  const [colorHexDraft, setColorHexDraft] = useState("#000000")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSizes(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setSizes((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) next.push(p)
      }
      return next
    })
    setSizeDraft("")
  }

  function addColor() {
    const cn = colorNameDraft.trim()
    if (!cn || colors.some((c) => c.colorName === cn)) return
    if (!/^#[0-9a-fA-F]{6}$/.test(colorHexDraft)) return
    setColors([...colors, { colorName: cn, colorHex: colorHexDraft }])
    setColorNameDraft("")
  }

  async function save() {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createItem({
        data: {
          articleNumber,
          name,
          description: description || undefined,
          category: category.trim(),
          sizes,
          colors,
        },
      })
      onCreated(created.id, created.articleNumber)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Article number</label>
        <Input
          className="h-11 text-base"
          value={articleNumber}
          onChange={(e) => setArticleNumber(e.target.value)}
          placeholder="TR-001"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Item name</label>
        <Input
          className="h-11 text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Crew-neck T-shirt"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Description (optional)</label>
        <Textarea
          className="text-base"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Category</label>
        <CreatableCombobox
          options={categories}
          value={category}
          onChange={setCategory}
          placeholder="Pick or type a category"
          searchPlaceholder="Search categories…"
          emptyMessage="Type to create a new category."
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Sizes</label>
        <Input
          className="h-11 text-base"
          value={sizeDraft}
          onChange={(e) => setSizeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addSizes(sizeDraft)
            }
          }}
          onBlur={() => {
            if (sizeDraft.trim()) addSizes(sizeDraft)
          }}
          placeholder="Type sizes separated by commas, then Enter"
        />
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sizes.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1">
                {s}
                <button
                  type="button"
                  onClick={() => setSizes(sizes.filter((x) => x !== s))}
                  aria-label={`remove ${s}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {SIZE_QUICK_PICKS.filter((s) => !sizes.includes(s)).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addSizes(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Initial colors (optional)
        </label>
        <p className="text-xs text-muted-foreground">
          Adding colors here materializes a variant for every (color × size)
          combination on save. You can also add colors later from the item
          detail page.
        </p>
        <div className="flex flex-wrap gap-1">
          {colors.map((c) => (
            <Badge
              key={c.colorName}
              variant="secondary"
              className="gap-1"
              style={{ borderColor: c.colorHex }}
            >
              <span
                className="inline-block size-3 rounded-full border"
                style={{ backgroundColor: c.colorHex }}
                aria-hidden
              />
              {c.colorName}
              <button
                type="button"
                onClick={() =>
                  setColors(colors.filter((x) => x.colorName !== c.colorName))
                }
                aria-label={`remove ${c.colorName}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-10 text-sm"
            value={colorNameDraft}
            onChange={(e) => setColorNameDraft(e.target.value)}
            placeholder="Color name (e.g. Burgundy)"
          />
          <HexColorField
            value={colorHexDraft}
            onChange={setColorHexDraft}
            ariaLabel="Pick color"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addColor}
            disabled={!colorNameDraft.trim()}
          >
            Add color
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={
            !articleNumber ||
            !name ||
            !category.trim() ||
            sizes.length === 0 ||
            submitting
          }
        >
          {submitting ? "Saving…" : "Create item"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check + run dev server smoke**

```bash
pnpm tsc --noEmit
```

Expected: clean.

Smoke test in the browser:

```bash
pnpm dev
```

In a browser at `http://localhost:3000/items`:
1. Click **Create item**.
2. Fill article number `TR-100`, name `T1`, type a brand-new category like `Tops`, pick size `M`, click **Create item**.
3. Expected: dialog closes, list shows the new item. No console errors.
4. Click **Create item** again, try article number `TR-100` (duplicate). Expected: dialog stays open with a destructive-color error message containing the DB unique-constraint message.
5. Click **Create item**. The category combobox should now offer `Tops` as a pickable option. Pick it. Save successfully with a different article number.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-editor.tsx src/routes/items/index.tsx
git commit -m "feat(items): category combobox + inline error in create-item dialog"
```

---

## Task 9: Inline category edit on the item detail page

**Files:**
- Create: `src/components/items/category-edit-popover.tsx`
- Modify: `src/routes/items/$articleNumber.tsx`

- [ ] **Step 1: Create the category edit popover component**

Create `src/components/items/category-edit-popover.tsx`:

```tsx
import { useState } from "react"
import { Pencil } from "lucide-react"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { CreatableCombobox } from "#/components/ui/creatable-combobox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"
import { updateItem } from "#/server/functions/items/items"

interface Props {
  itemId: string
  articleNumber: string
  name: string
  current: string
  categories: ReadonlyArray<string>
  canEdit: boolean
  onSaved: () => void
}

/**
 * Renders the item's category as a Badge. When `canEdit`, a pencil
 * button next to it opens a popover with a CreatableCombobox + Save /
 * Cancel. Save posts updateItem and calls onSaved() so the route can
 * invalidate.
 */
export function CategoryEditPopover({
  itemId,
  articleNumber,
  name,
  current,
  categories,
  canEdit,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(current)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const next = draft.trim()
    if (!next || next === current) {
      setOpen(false)
      return
    }
    setPending(true)
    setError(null)
    try {
      await updateItem({
        data: {
          id: itemId,
          articleNumber,
          name,
          category: next,
        },
      })
      setOpen(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update category.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Badge variant="secondary">{current}</Badge>
      {canEdit && (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) {
              setDraft(current)
              setError(null)
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Edit category"
            >
              <Pencil className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <p className="text-sm font-medium">Category</p>
            <CreatableCombobox
              options={categories}
              value={draft}
              onChange={setDraft}
              placeholder="Pick or type a category"
            />
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={pending || !draft.trim()}
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Surface the popover in the item detail page**

Edit `src/routes/items/$articleNumber.tsx`. Add the categories fetch to the loader and render the popover next to the name.

Update imports:

```diff
-import { getItemByArticle } from "#/server/functions/items/items"
+import {
+  getItemByArticle,
+  listItemCategories,
+} from "#/server/functions/items/items"
@@
 import { ColorEditor } from "#/components/items/color-editor"
+import { CategoryEditPopover } from "#/components/items/category-edit-popover"
```

Update the loader to fetch categories in parallel:

```diff
   loader: async ({ params }) => {
     const product = await getItemByArticle({
       data: { articleNumber: params.articleNumber },
     })
     if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
-    const [prices, variantStockCounts] = await Promise.all([
+    const [prices, variantStockCounts, categories] = await Promise.all([
       listItemStockPrices({ data: { itemId: product.id } }),
       countVariantStockLocations({ data: { itemId: product.id } }),
+      listItemCategories(),
     ])
-    return { product, prices, variantStockCounts }
+    return { product, prices, variantStockCounts, categories }
   },
```

Pull categories from the loader data:

```diff
 function ProductDetailPage() {
-  const { product, prices, variantStockCounts } = Route.useLoaderData()
+  const { product, prices, variantStockCounts, categories } =
+    Route.useLoaderData()
```

Render the popover next to the item name in the page header. Find the JSX that renders the item name (look for the page heading, e.g. `<h1>{product.name}</h1>` or similar) and insert the popover right after it:

```tsx
<div className="flex items-center gap-2">
  <h1 className="text-2xl font-bold">{product.name}</h1>
  <CategoryEditPopover
    itemId={product.id}
    articleNumber={product.articleNumber}
    name={product.name}
    current={product.category}
    categories={categories}
    canEdit={canManage}
    onSaved={() => void router.invalidate()}
  />
</div>
```

(Adjust the wrapping `<div>` to match the page's existing layout — the goal is the badge sits inline with or directly below the name.)

- [ ] **Step 3: Type-check + browser smoke**

```bash
pnpm tsc --noEmit
```

```bash
pnpm dev
```

In the browser:
1. Open `/items` and click an item you created in Task 8.
2. Verify the category badge appears next to the name.
3. As admin, click the pencil → popover opens → pick a different category from the combobox (or type a new one) → Save.
4. Page refreshes, badge shows the new category.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/items/category-edit-popover.tsx src/routes/items/$articleNumber.tsx
git commit -m "feat(items): inline category edit on item detail page"
```

---

## Task 10: Update Cypress E2E that reference item_categories

**Files:**
- Modify: `cypress/support/cleanup.ts`
- Modify: `cypress/e2e/08-mobile-pos.cy.ts`
- Modify: `cypress/e2e/11-restock-flow.cy.ts`
- Modify (if applicable): any `cypress/e2e/*.cy.ts` that drives the create-item form

- [ ] **Step 1: Survey current Cypress category usage**

```bash
grep -rn "item_categor\|itemCategor\|item_category_id" cypress/
```

For each hit, apply the same migration pattern used in the backend tests:

- Replace seed/cleanup statements that touch `item_categories` with operations on `items.category` text.
- Where a fixture inserts an item, switch from `item_category_id: uncat.id` to `category: 'Test'`.
- Drop any `DELETE FROM item_categories` line from `cypress/support/cleanup.ts` — that table no longer exists.

- [ ] **Step 2: Add category interaction to any create-item E2E flow**

Look for tests that click the "Create item" button in the items page. The form now has a required Category combobox. For each such test, after filling the article number and name, drive the combobox:

```ts
// open combobox
cy.findByRole('combobox', { name: /category|pick or type/i }).click()
// type a new category (no existing options on a fresh DB)
cy.findByPlaceholderText(/search categories/i).type('Test')
// click the synthetic Create row
cy.findByRole('option', { name: /create "test"/i }).click()
```

Apply this to any `it(...)` block that previously got away without setting a category.

- [ ] **Step 3: Run the full Cypress suite headless**

```bash
pnpm cypress run
```

Expected: all specs pass. Fix any spec that still references the dropped table or skips the new Category field.

- [ ] **Step 4: Commit**

```bash
git add cypress
git commit -m "test(e2e): migrate cypress off item_categories; drive category combobox in create-item"
```

---

## Task 11: Add InfoTip for the Category field (per project policy)

**Files:**
- Modify: `src/lib/help-dictionary.ts`
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/components/items/category-edit-popover.tsx`

Project memory `feedback_info_tips` requires every form field to have an `InfoTip` with a description in `help-dictionary.ts`. We added a Category field and need to comply.

- [ ] **Step 1: Add the dictionary entry**

Open `src/lib/help-dictionary.ts` and add an entry for the category field. Match the style of the existing entries (key: a stable string, value: the description text). Example shape — adapt to the file's existing format:

```ts
"items.create.category": {
  description:
    "Free-text grouping for catalog reporting (e.g. Shoes, Bags, Tops). Pick from existing categories or type a new one — the list updates as items use new values.",
},
```

(If the file uses arrays, tuples, or a different schema, follow its existing pattern.)

- [ ] **Step 2: Render the InfoTip beside the field label**

In `src/components/items/item-editor.tsx`, wrap the Category label with an InfoTip like the other fields do (use grep to find an example: `grep -n "InfoTip" src/components/items/*.tsx src/routes/items/*.tsx`). Same treatment in `category-edit-popover.tsx` for the popover's "Category" heading.

- [ ] **Step 3: Type-check + dev smoke**

```bash
pnpm tsc --noEmit
```

Confirm in the browser that the (i) icon shows the description on hover/click for both the create dialog and the detail-page popover.

- [ ] **Step 4: Commit**

```bash
git add src/lib/help-dictionary.ts src/components/items/item-editor.tsx src/components/items/category-edit-popover.tsx
git commit -m "chore(ui): InfoTip for category field"
```

---

## Task 12: Final verification sweep

- [ ] **Step 1: Full type-check**

```bash
pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Full vitest run**

```bash
pnpm vitest run
```

Expected: all green.

- [ ] **Step 3: Full Cypress run**

```bash
pnpm cypress run
```

Expected: all specs pass.

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: no errors. (Per project memory `feedback_no_disable_lint`, fix root causes — do not disable rules or use `ts-ignore`.)

- [ ] **Step 5: Manual sanity in the browser**

```bash
pnpm dev
```

Walk through:
1. `/items` shows the seeded items with category Uncategorized in the list (it's not necessarily surfaced on the card — that's fine).
2. Create-item dialog: typing a brand-new category shows the "Create '...'" row in the combobox. Saving works. Re-opening the dialog shows the new category as a pickable option.
3. Triggering a known server error (duplicate article number) surfaces the inline destructive message instead of silently doing nothing.
4. Item detail page: category badge renders. Pencil edit works. Network error during update surfaces inline error in the popover.
5. `/settings/categories` returns a 404 / route-not-found.

- [ ] **Step 6: Final commit if anything was tidied**

Only commit if Steps 1–5 surfaced any cleanup. Otherwise nothing to commit.

```bash
git status
# if dirty:
git add -A
git commit -m "chore: tidy after items-free-text-category implementation"
```

---

## Self-review notes

- Spec coverage: every spec section maps to a task (schema → Task 1; seed → Task 2; server fns → Task 3; admin fn deletion → Task 4; settings route deletion → Task 5; test migration → Task 6; new component → Task 7; create form → Task 8; detail edit → Task 9; cypress → Task 10; InfoTip per policy → Task 11; full verification → Task 12).
- Type consistency: `category` is the property name used on `items`, `upsertInput`, the `ItemEditor` state, the `CategoryEditPopover` props, the seed insert, and the `listItemCategories` projection. `listItemCategories` is the canonical name; the deleted admin fn of the same name lives in a different module path so there's no overlap window.
- No placeholders or "implement later" — all code is shown in full.
