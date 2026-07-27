/**
 * listItemCategories returns the distinct sorted set of category values
 * actually in use on items — used by the create-item combobox to surface
 * existing categories.
 *
 * Uses the pure query helpers from items.server.ts directly (mirroring
 * src/__tests__/item-categories.test.ts:13–16): TanStack's createServerFn
 * wrapper swallows return values when invoked outside SSR, so we exercise
 * the data semantics here and rely on the route-level / Cypress tests for
 * RBAC + wrapper coverage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { items, suppliers } from '#/db/schema'
import {
  createItemQuery,
  listItemCategoriesQuery,
} from '#/server/functions/items/items.server'
import { listItemCategories } from '#/server/functions/items/items'

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createdItemIds: string[] = []
let supplierId = ''

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
    if (supplierId)
      await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  }
})

describe('listItemCategories', () => {
  beforeAll(async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({ name: `Category supplier ${SUFFIX}`, type: 'international' })
      .returning()
    supplierId = supplier.id
    for (const [an, cat] of [
      [`lic-${SUFFIX}-1`, `lic-${SUFFIX}-Shoes`],
      [`lic-${SUFFIX}-2`, `lic-${SUFFIX}-Bags`],
      [`lic-${SUFFIX}-3`, `lic-${SUFFIX}-Shoes`],
    ] as const) {
      await createItemQuery({
        articleNumber: an,
        name: an,
        category: cat,
        supplierId,
        costPrice: '10.00',
        costCurrency: 'RMB',
        minimumSellPriceUgx: '50000',
        sizes: [],
        colors: [],
      })
    }
    const created = await db.query.items.findMany({
      where: (row, { like }) => like(row.articleNumber, `lic-${SUFFIX}-%`),
    })
    for (const c of created) createdItemIds.push(c.id)
  })

  it('returns distinct categories sorted ascending', async () => {
    const cats = await listItemCategoriesQuery()
    const ours = cats.filter((c) => c.startsWith(`lic-${SUFFIX}-`))
    expect(ours).toEqual([`lic-${SUFFIX}-Bags`, `lic-${SUFFIX}-Shoes`])
  })

  // Smoke-check that the createServerFn wrapper consumers actually import is
  // wired up. Return-value behavior is covered by the pure-helper test above
  // and by the Cypress e2e for the items page.
  it('exports listItemCategories as a callable server function', () => {
    expect(typeof listItemCategories).toBe('function')
  })
})
