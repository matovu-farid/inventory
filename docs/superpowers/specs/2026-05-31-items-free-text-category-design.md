# Items free-text category + create-item error handling

## Context

Two user-visible defects on `localhost:3000/items`:

1. **Create item silently fails.** `createItem` (`src/server/functions/items/items.ts:99`) calls `getUncategorizedId()`, which throws if the `item_categories."Uncategorized"` seed row is missing. The client `save()` in `src/components/items/item-editor.tsx:62` has only `try / finally` — the rejection becomes an unhandled promise and the dialog stays open with no feedback.
2. **No way to set or pick a category on an item.** The editor doesn't expose category at all; every item silently defaults to "Uncategorized". The admin-managed `item_categories` table + `/settings/categories` page exist but are decoupled from the item create flow.

The fix is to make categories a free-text column on `items`, with a combobox that autocompletes from the distinct categories already in use and lets the user type a new one — matching the model in the prompt link to shadcn's combobox.

Greenfield database — there are zero rows in `items` and zero rows in `item_categories`, so the migration needs no backfill.

## Goals

- Create item never silently fails — the user always sees an error message in the dialog when the server rejects.
- Category is a required, free-text field on items, edited via a creatable combobox.
- The combobox's option list is the distinct set of categories already present on items.
- The legacy `item_categories` table, its admin page, and its admin server fns are removed.

## Non-goals

- No toast library is introduced; inline error display matches the existing pattern in `opening-balance-form.tsx:120`.
- No bulk "rename category X → Y" UI. Per-item edit covers the use case for now.
- No category metadata (color, icon, parent).

## Schema migration

`drizzle/0018_items_category_text.sql` — the single source of truth for the data migration step. The TS schema files are updated to match the final state and `drizzle-kit push` will reconcile.

```sql
-- Items free-text category — replaces the items.item_category_id FK and
-- the item_categories table.
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_item_category_id_item_categories_id_fk";
ALTER TABLE "items" DROP COLUMN IF EXISTS "item_category_id";
DROP INDEX IF EXISTS "idx_items_category";
ALTER TABLE "items" ADD COLUMN "category" text NOT NULL;
CREATE INDEX "idx_items_category" ON "items" ("category");
DROP TABLE IF EXISTS "item_categories";
```

- `src/db/schema/items.ts` — replace `itemCategoryId` with `category: text("category").notNull()`; keep the `idx_items_category` index name (now on the text column). Remove the import of `itemCategories` and the relation entry for it.
- `src/db/schema/item-categories.ts` — delete.
- `src/db/schema/index.ts` — drop the `export * from './item-categories'` line.
- `src/db/seed.ts` — drop the `INSERT INTO item_categories` block; seeded items pass `category: 'Uncategorized'` directly.

## Server layer

`src/server/functions/items/items.ts`:

- `upsertInput` adds `category: z.string().trim().min(1).max(64)`.
- `createItem` handler drops `getUncategorizedId()` entirely and writes `category` directly.
- `updateItem` accepts the optional category patch like the other fields.
- Add `listItemCategories` server fn:

  ```ts
  export const listItemCategories = createServerFn().handler(async () => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const rows = await db
      .selectDistinct({ category: items.category })
      .from(items)
      .orderBy(asc(items.category))
    return rows.map((r) => r.category)
  })
  ```

`src/server/functions/admin/item-categories.ts` and `item-categories.server.ts` — delete.

`src/lib/permissions.ts`:

- Drop the `itemCategories.manage` entry from the `Permission` union, the role permission lists, and the `permissionScopes` map.

## CreatableCombobox component

New file `src/components/ui/creatable-combobox.tsx`, built on the same `Command` + `Popover` primitives as the existing `Combobox`. The current `Combobox` (`src/components/ui/combobox.tsx`) stays untouched so its consumers don't have to change.

Props:

```ts
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
```

Behavior:

- Trigger is a `Button variant="outline"` showing `value` or `placeholder`, identical visual treatment to `Combobox`.
- Inside the popover, `CommandInput` is bound to a local `query` state so we can detect "typed value not in options".
- The list shows options filtered by `query` via the built-in `Command` filtering (case-insensitive substring).
- When `query.trim()` is non-empty AND no option case-insensitively equals `query.trim()`, a top "Create '<query>'" `CommandItem` is rendered. Selecting it calls `onChange(query.trim())` and closes the popover.
- Selecting an existing option calls `onChange(option)` and closes.
- Pressing `Enter` in `CommandInput` selects the highlighted row, which is `cmdk`'s default — the "Create" row is just another row at the top of the list, so Enter on an unmatched query creates.
- `value` is the plain string. There is no separate `label` (categories self-label).

## UI integration

`src/components/items/item-editor.tsx`:

- Load categories with `useQuery({ queryKey: ['itemCategories'], queryFn: () => listItemCategories() })`. The form renders normally during fetch — the combobox shows an empty option list, which is fine because the user can still type a new category.
- Add a Category field between Description and Sizes:

  ```tsx
  <div className="space-y-1">
    <label className="text-sm font-medium">Category</label>
    <CreatableCombobox
      options={categoriesQuery.data ?? []}
      value={category}
      onChange={setCategory}
      placeholder="Pick or type a category"
      searchPlaceholder="Search categories…"
    />
  </div>
  ```

- Submit button `disabled` predicate gains `!category.trim()`.
- `save()` is rewritten:

  ```ts
  async function save() {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createItem({
        data: { articleNumber, name, description: description || undefined, category, sizes, colors },
      })
      onCreated(created.id, created.articleNumber)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item")
    } finally {
      setSubmitting(false)
    }
  }
  ```

- Above the submit button, render `{error && <p className="text-sm text-destructive">{error}</p>}`.

`src/routes/items/$articleNumber.tsx`:

- Show the category as a `<Badge variant="secondary">` next to the item name in the header.
- When `canManage`, a pencil button next to the badge opens a small `Popover` containing a `<CreatableCombobox>` (options from `listItemCategories`) and Save / Cancel buttons. Save calls `updateItem({ data: { id, category: next } })`, then `router.invalidate()`. Same inline-error treatment as the create form.

## Inline error pattern

Pattern matches `src/components/opening-balance/opening-balance-form.tsx:120` so it's already familiar in the codebase:

```ts
const [error, setError] = useState<string | null>(null)
// in submit: setError(null) before, catch → setError(message)
// in JSX: {error && <p className="text-sm text-destructive">{error}</p>}
```

Applied in two places for this change: create dialog and detail-page category edit.

## Routes / nav cleanup

- `src/routes/settings/categories.tsx` — delete the file. TanStack Router's generated route tree (`src/routeTree.gen.ts`) drops the route on next dev-server start.
- Wherever the settings nav surfaces "Item categories" (typically `src/components/layout/*` or the settings index route), drop the link.

## Tests

Update — every test that inserts an item directly switches from `itemCategoryId: <fk>` to `category: 'Test'`:

- `src/__tests__/create-item-materializes-variants.test.ts` — add `category: 'Test'` to both `createItem` calls.
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

Delete — `src/__tests__/item-categories.test.ts` (covered the admin fns being removed).

Add — new unit test `src/__tests__/list-item-categories.test.ts` covering: returns distinct, sorted, only categories from existing items.

Cypress — `cypress/e2e/08-mobile-pos.cy.ts`, `11-restock-flow.cy.ts`, and `cypress/support/cleanup.ts` reference `item_categories`; switch to inserting items with a `category` text column and drop any category-table setup. No need to seed any category row.

## Risks / open questions

- The `idx_items_category` index name is reused on the new text column. Postgres allows it because the old column is dropped before the new index is created. Verified by ordering DDL statements in the migration file.
- `selectDistinct` on a text column is fine for the expected category count (single-digit to dozens). If it grows large (1000+), revisit with a materialized list or a dedicated lookup.
- Removing the `/settings/categories` route is a permission-visible UX change — admins will notice. Acceptable per the user's "drop everything" decision.
