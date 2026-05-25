// Client-reachable wrapper module: declares createServerFn() wrappers for
// the four item_categories admin actions. All actual data access lives in
// `./item-categories.server` — that file is excluded from the client
// bundle by TanStack's import-protection plugin (`.server.ts` suffix).
//
// Keeping `#/db` out of this file's module scope is mandatory: this module
// is reachable from src/routes/settings/categories.tsx via the routeTree,
// and the plugin walks the static import graph regardless of whether the
// imports are only used inside server-fn handlers.

import { createServerFn } from '@tanstack/react-start'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import {
  createInput,
  createItemCategoryQuery,
  deleteInput,
  deleteItemCategoryQuery,
  listItemCategoriesQuery,
  renameInput,
  renameItemCategoryQuery,
} from './item-categories.server'

// ─── Server-function wrappers ────────────────────────────────────────────────
// Each wrapper enforces the `itemCategories.manage` permission (admin only)
// via the shared requireRole gate.

export const listItemCategories = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ['admin'])
  return listItemCategoriesQuery()
})

export const createItemCategory = createServerFn()
  .inputValidator(createInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])
    return createItemCategoryQuery(data)
  })

export const renameItemCategory = createServerFn()
  .inputValidator(renameInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])
    return renameItemCategoryQuery(data)
  })

export const deleteItemCategory = createServerFn()
  .inputValidator(deleteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])
    return deleteItemCategoryQuery(data)
  })
