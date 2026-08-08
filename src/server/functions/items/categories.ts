import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  archiveItemCategoryQuery,
  createItemCategoryQuery,
  listItemCategoriesQuery,
  restoreItemCategoryQuery,
  updateItemCategoryQuery,
} from './categories.server'

export const listItemCategoriesWithArchived = createServerFn()
  .inputValidator(z.object({ includeArchived: z.boolean().optional() }).optional())
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return listItemCategoriesQuery(data)
  })

export const createItemCategory = createServerFn()
  .inputValidator(z.object({ name: z.string() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return createItemCategoryQuery(data)
  })

export const updateItemCategory = createServerFn()
  .inputValidator(z.object({ id: z.uuid(), name: z.string() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return updateItemCategoryQuery(data)
  })

export const archiveItemCategory = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    return archiveItemCategoryQuery(data)
  })

export const restoreItemCategory = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    return restoreItemCategoryQuery(data)
  })
