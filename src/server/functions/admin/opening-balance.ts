// Client-reachable wrapper: keep `#/db` out of this module's import graph.
// See opening-balance.server.ts for the implementation.

import { createServerFn } from '@tanstack/react-start'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  addShopOpeningBalanceQuery,
  addStoreOpeningBalanceQuery,
  shopOpeningInput,
  storeOpeningInput,
} from './opening-balance.server'

export const addStoreOpeningBalance = createServerFn()
  .inputValidator(storeOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    return addStoreOpeningBalanceQuery(data, session.user.id)
  })

export const addShopOpeningBalance = createServerFn()
  .inputValidator(shopOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    return addShopOpeningBalanceQuery(data, session.user.id)
  })
