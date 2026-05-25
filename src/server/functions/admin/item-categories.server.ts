// Server-only module: exports query helpers + Zod schemas for the
// item_categories table. Split out from item-categories.ts because that
// file is imported by a client-reachable route (src/routes/settings/categories.tsx);
// TanStack Start's import-protection plugin denies any client-reachable
// module that imports `#/db` at module scope. The `.server.ts` suffix is
// TanStack's canonical marker for a server-only module — the client
// bundle excludes it entirely. See:
// https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
//
// Consumers:
//   - src/server/functions/admin/item-categories.ts (createServerFn wrappers)
//   - src/__tests__/item-categories.test.ts (vitest, server-side)

import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { itemCategories } from '#/db/schema'

export const nameInput = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or fewer')
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, { message: 'Name is required' })

export const createInput = z.object({ name: nameInput })
export const renameInput = z.object({ id: z.uuid(), name: nameInput })
export const deleteInput = z.object({ id: z.uuid() })

/**
 * Translate a unique-constraint violation from Postgres into a friendly
 * error. We rely on the error code (`23505`) rather than the message text
 * since the latter varies across drivers (neon vs. pg). Drizzle wraps the
 * underlying driver error in a `DrizzleQueryError` whose `.cause` carries
 * the original Postgres error with the `code` property.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const direct = (err as { code?: unknown }).code
  if (typeof direct === 'string') return direct
  const cause = (err as { cause?: unknown }).cause
  if (typeof cause === 'object' && cause !== null) {
    const nested = (cause as { code?: unknown }).code
    if (typeof nested === 'string') return nested
  }
  return undefined
}

export function rethrowDuplicate(err: unknown, name: string): never {
  if (pgErrorCode(err) === '23505') {
    throw new Error(`A category named "${name}" already exists`)
  }
  throw err as Error
}

// ─── Pure query helpers ──────────────────────────────────────────────────────
// Exported separately from the createServerFn wrappers so that vitest can
// exercise the data semantics directly. TanStack's server-fn wrapper
// swallows return values when called outside SSR (see
// audit-list.test.ts:9–14 for the same pattern).

export async function listItemCategoriesQuery() {
  return db.select().from(itemCategories).orderBy(asc(itemCategories.name))
}

export async function createItemCategoryQuery(input: { name: string }) {
  const parsed = createInput.parse(input)
  try {
    const [row] = await db
      .insert(itemCategories)
      .values({ name: parsed.name })
      .returning()
    return row
  } catch (err) {
    rethrowDuplicate(err, parsed.name)
  }
}

export async function renameItemCategoryQuery(input: {
  id: string
  name: string
}) {
  const parsed = renameInput.parse(input)
  try {
    const rows = await db
      .update(itemCategories)
      .set({ name: parsed.name })
      .where(eq(itemCategories.id, parsed.id))
      .returning()
    if (rows.length === 0) throw new Error('Category not found')
    return rows[0]
  } catch (err) {
    rethrowDuplicate(err, parsed.name)
  }
}

export async function deleteItemCategoryQuery(input: { id: string }) {
  const parsed = deleteInput.parse(input)
  const deleted = await db
    .delete(itemCategories)
    .where(eq(itemCategories.id, parsed.id))
    .returning()
  if (deleted.length === 0) throw new Error('Category not found')
  return { ok: true as const }
}
