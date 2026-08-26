import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { itemArticleNumbers, items, supplyRoutes, suppliers } from '#/db/schema'
import { createSupplyRouteReceiptServer } from '../receipts.server'

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({ user: { id: TEST_USER_ID, role: 'admin' } }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
  requireSessionAndRole: () =>
    Promise.resolve({ user: { id: TEST_USER_ID, role: 'admin' } }),
}))

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createdItemIds: string[] = []
let routeId = ''
let supplierId = ''
let otherSupplierId = ''

beforeAll(async () => {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name: `Receipt auto item supplier ${suffix}`,
      type: 'international',
    })
    .returning()
  supplierId = supplier.id
  const [otherSupplier] = await db
    .insert(suppliers)
    .values({ name: `Receipt other supplier ${suffix}`, type: 'international' })
    .returning()
  otherSupplierId = otherSupplier.id
  const [route] = await db
    .insert(supplyRoutes)
    .values({
      name: `Receipt auto item route ${suffix}`,
      rateRmbPerUsd: '7.25',
      rateUgxPerUsd: '3750',
    })
    .returning()
  routeId = route.id
})

afterAll(async () => {
  if (routeId) await db.delete(supplyRoutes).where(eq(supplyRoutes.id, routeId))
  if (createdItemIds.length > 0) {
    await db
      .delete(itemArticleNumbers)
      .where(inArray(itemArticleNumbers.itemId, createdItemIds))
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
  if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  if (otherSupplierId)
    await db.delete(suppliers).where(eq(suppliers.id, otherSupplierId))
})

function draft(
  design: string,
  articleNumber: string,
  receiptSupplierId = supplierId,
) {
  return {
    supplyRouteId: routeId,
    supplierId: receiptSupplierId,
    foreignCurrency: 'RMB' as const,
    lines: [
      {
        design,
        articleNumber,
        quantity: 10,
        unitPriceForeign: '3.00',
      },
    ],
  }
}

describe('receipt item materialization', () => {
  it('creates an item and attaches its receipt art number', async () => {
    const design = `Receipt jacket ${suffix}`
    const articleNumber = `RA-${suffix}`

    const result = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )
    const created = await db.query.items.findFirst({
      where: eq(items.design, design),
    })

    expect(created?.id).toBe(result.lines[0].itemId)
    expect(created?.design).toBe(design)
    const article = await db.query.itemArticleNumbers.findFirst({
      where: eq(itemArticleNumbers.articleNumber, articleNumber.toUpperCase()),
    })
    expect(article?.itemId).toBe(created?.id)
    if (created) createdItemIds.push(created.id)
  })

  it('reuses an item for the same design and adds a second art number', async () => {
    const design = `Receipt jacket ${suffix}`
    const result = await createSupplyRouteReceiptServer(
      draft(design, `RB-${suffix}`),
    )
    const item = await db.query.items.findFirst({
      where: eq(items.design, design),
    })
    const numbers = item
      ? await db.query.itemArticleNumbers.findMany({
          where: eq(itemArticleNumbers.itemId, item.id),
        })
      : []

    expect(result.lines[0].itemId).toBe(item?.id)
    expect(numbers.map((number) => number.articleNumber)).toEqual(
      expect.arrayContaining([
        `RA-${suffix}`.toUpperCase(),
        `RB-${suffix}`.toUpperCase(),
      ]),
    )
    if (item) createdItemIds.push(item.id)
  })

  it('allows restocking an art number for the same design and supplier', async () => {
    const design = `Supplier restock design ${suffix}`
    const articleNumber = `RESTOCK-${suffix}`
    const first = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )
    const second = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )

    expect(second.lines[0].itemId).toBe(first.lines[0].itemId)
    if (first.lines[0].itemId) createdItemIds.push(first.lines[0].itemId)
  })

  it('rejects an art number for the same design from another supplier', async () => {
    const design = `Supplier-specific design ${suffix}`
    const articleNumber = `SUPPLIER-${suffix}`
    const first = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )
    if (first.lines[0].itemId) createdItemIds.push(first.lines[0].itemId)

    await expect(
      createSupplyRouteReceiptServer(
        draft(design, articleNumber, otherSupplierId),
      ),
    ).rejects.toThrow('another supplier')
  })

  it('rejects an art number already owned by another item', async () => {
    await expect(
      createSupplyRouteReceiptServer(
        draft(`Different design ${suffix}`, `RA-${suffix}`),
      ),
    ).rejects.toThrow('Art number')
  })

  it('allows repeated item and art numbers across ordinary receipt rows', async () => {
    const design = `Repeated design ${suffix}`
    const articleNumber = `RC-${suffix}`
    const result = await createSupplyRouteReceiptServer({
      ...draft(design, articleNumber),
      lines: [
        { design, articleNumber, quantity: 10, unitPriceForeign: '3.00' },
        { design, articleNumber, quantity: 20, unitPriceForeign: '3.00' },
      ],
    })

    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].itemId).toBe(result.lines[1].itemId)
    expect(result.lines[0].entryId).not.toBe(result.lines[1].entryId)
    const item = await db.query.items.findFirst({
      where: eq(items.design, design),
    })
    if (item) createdItemIds.push(item.id)
  })
})
