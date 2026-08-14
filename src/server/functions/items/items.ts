// Client-reachable wrapper module: declares createServerFn() wrappers for
// the items endpoints. All actual data access lives in `./items.server` —
// that file is excluded from the client bundle by TanStack's
// import-protection plugin (`.server.ts` suffix).
//
// Keeping `#/db` out of this file's module scope is mandatory: this module
// is reachable from src/routes/items/* via the routeTree, and the plugin
// walks the static import graph regardless of whether the imports are
// only used inside server-fn handlers.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  createItemQuery,
  deleteItemQuery,
  getItemByArticleQuery,
  archiveItemQuery,
  listItemCategoriesQuery,
  listItemSizesQuery,
  listItemsQuery,
  returnDateFilter,
  searchItemsQuery,
  restoreItemQuery,
  updateInput,
  updateItemQuery,
  upsertInput,
} from './items.server'

// ─── Server-function wrappers ────────────────────────────────────────────────
// Read endpoints allow admin/supervisor/sales; write endpoints are
// restricted to admin/supervisor.

export const listItems = createServerFn()
  .inputValidator(
    z
      .object({ includeArchived: z.boolean().optional() })
      .and(returnDateFilter)
      .optional(),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return listItemsQuery(data)
  })

export const getItemByArticle = createServerFn()
  .inputValidator(
    z.object({
      articleNumber: z.string().min(1),
      includeArchived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return getItemByArticleQuery(data)
  })

export const searchItems = createServerFn()
  .inputValidator(
    z
      .object({ query: z.string(), includeArchived: z.boolean().optional() })
      .and(returnDateFilter),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return searchItemsQuery(data)
  })

/**
 * Returns the distinct set of category values currently in use on items,
 * sorted ascending. Powers the create-item / detail-edit combobox.
 */
export const listItemCategories = createServerFn().handler(async () => {
  await requireSessionAndRole(['admin', 'supervisor', 'sales'])
  return listItemCategoriesQuery()
})

export const createItem = createServerFn()
  .inputValidator(upsertInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return createItemQuery(data)
  })

export const updateItem = createServerFn()
  .inputValidator(updateInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return updateItemQuery(data)
  })

export const archiveItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return archiveItemQuery(data)
  })

export const restoreItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return restoreItemQuery(data)
  })

export const deleteItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    return deleteItemQuery(data)
  })

/**
 * Lists the sizes currently materialized for an item by reading the
 * variants table. Returns the unique set of sizes (preserves the
 * insertion order); the UI sorts via deriveSizes() for display.
 */
export const listItemSizes = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return listItemSizesQuery(data)
  })
