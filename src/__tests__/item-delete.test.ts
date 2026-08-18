import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { items, suppliers, supplyRouteLines, supplyRoutes } from '#/db/schema'
import {
  createItemQuery,
  deleteItemQuery,
} from '#/server/functions/items/items.server'

const suffix = `delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const supplierIds: string[] = []
const itemIds: string[] = []
const routeIds: string[] = []

afterAll(async () => {
  for (const routeId of routeIds) {
    await db.delete(supplyRoutes).where(eq(supplyRoutes.id, routeId))
  }
  for (const itemId of itemIds) {
    await db.delete(items).where(eq(items.id, itemId))
  }
  for (const supplierId of supplierIds) {
    await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  }
})

async function createSupplier(name: string) {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name, type: 'international' })
    .returning()
  supplierIds.push(supplier.id)
  return supplier.id
}

async function createItem(supplierId: string, articleNumber: string) {
  const item = await createItemQuery({
    name: `Delete item ${articleNumber}`,
    design: `Delete design ${suffix}`,
    articleNumbers: [articleNumber],
    supplierId,
    costPrice: '10',
    costCurrency: 'RMB',
    minimumSellPriceUgx: '50000',
    sizes: [],
    colors: [],
  })
  itemIds.push(item.id)
  return item.id
}

describe('item permanent deletion safeguards', () => {
  it('permanently deletes an item with no references', async () => {
    const supplierId = await createSupplier(`Delete supplier ${suffix}`)
    const itemId = await createItem(supplierId, `DELETE-FREE-${suffix}`)

    await expect(deleteItemQuery({ id: itemId })).resolves.toEqual({
      id: itemId,
    })
    expect(
      await db.query.items.findFirst({ where: eq(items.id, itemId) }),
    ).toBeUndefined()
  })

  it('requires archive when a route line references the item', async () => {
    const supplierId = await createSupplier(`Referenced supplier ${suffix}`)
    const itemId = await createItem(supplierId, `DELETE-REF-${suffix}`)
    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: `Referenced route ${suffix}`, status: 'open' })
      .returning()
    routeIds.push(route.id)
    await db.insert(supplyRouteLines).values({
      supplyRouteId: route.id,
      supplierId,
      itemId,
      quantity: 1,
      unitPriceForeign: '10',
      foreignCurrency: 'RMB',
      totalAmountForeign: '10',
      totalCostUgx: '50000',
    })

    await expect(deleteItemQuery({ id: itemId })).rejects.toThrow(
      'Archive it instead',
    )
    expect(
      await db.query.items.findFirst({ where: eq(items.id, itemId) }),
    ).toBeDefined()
  })
})
