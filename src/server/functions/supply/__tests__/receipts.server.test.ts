import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import {
  itemArticleNumbers,
  items,
  supplierCodes,
  supplyRoutes,
  suppliers,
} from '#/db/schema'
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
const supplierName = `Receipt auto item supplier ${suffix}`
const createdItemIds: string[] = []
let routeId = ''
let supplierId = ''
let otherSupplierId = ''
const otherSupplierName = `Receipt other supplier ${suffix}`

beforeAll(async () => {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name: supplierName,
      type: 'international',
    })
    .returning()
  supplierId = supplier.id
  const [otherSupplier] = await db
    .insert(suppliers)
    .values({ name: otherSupplierName, type: 'international' })
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
  if (supplierId || otherSupplierId) {
    await db
      .delete(supplierCodes)
      .where(inArray(supplierCodes.supplierId, [supplierId, otherSupplierId]))
  }
  if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  if (otherSupplierId)
    await db.delete(suppliers).where(eq(suppliers.id, otherSupplierId))
})

function draft(
  design: string,
  articleNumber: string,
  receiptSupplierId = supplierId,
  itemId?: string,
) {
  return {
    supplyRouteId: routeId,
    supplierId: receiptSupplierId,
    foreignCurrency: 'RMB' as const,
    lines: [
      {
        design,
        itemId,
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

  it('materializes receipt colours, sizes, and their variants on the item', async () => {
    const design = `Receipt round neck ${suffix}`
    const result = await createSupplyRouteReceiptServer({
      ...draft(design, `ATTR-${suffix}`),
      lines: [
        {
          itemName: 'Shirt',
          design,
          articleNumber: `ATTR-${suffix}`,
          colorText: 'Cream, Charcoal',
          colorHex: '#f5e9d0, #36454f',
          size: 'S, M, L',
          quantity: 75,
          unitPriceForeign: '28',
        },
      ],
    })
    const createdItemId = result.lines[0].itemId
    expect(createdItemId).toBeTruthy()
    const created = createdItemId
      ? await db.query.items.findFirst({
          where: eq(items.id, createdItemId),
          with: { colors: true, variants: true },
        })
      : undefined
    if (created) createdItemIds.push(created.id)

    expect(created?.name).toBe('Shirt')
    expect(created?.colors.map((color) => color.colorName)).toEqual(
      expect.arrayContaining(['Cream', 'Charcoal']),
    )
    expect(created?.variants).toHaveLength(6)
    expect(created?.variants.map((variant) => variant.size)).toEqual(
      expect.arrayContaining(['S', 'M', 'L']),
    )
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

  it('adds receipt colours and sizes when restocking an existing item', async () => {
    const design = `Restock attributes ${suffix}`
    const articleNumber = `ATTR-RESTOCK-${suffix}`
    const first = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )
    const second = await createSupplyRouteReceiptServer({
      ...draft(
        design,
        articleNumber,
        supplierId,
        first.lines[0].itemId ?? undefined,
      ),
      lines: [
        {
          itemName: 'Shirt',
          design,
          articleNumber,
          colorText: 'Navy',
          colorHex: '#0b1f44',
          size: 'M, L',
          quantity: 10,
          unitPriceForeign: '3.00',
        },
      ],
    })
    const itemId = second.lines[0].itemId
    expect(itemId).toBeTruthy()
    const item = itemId
      ? await db.query.items.findFirst({
          where: eq(items.id, itemId),
          with: { colors: true, variants: true },
        })
      : undefined
    if (item) createdItemIds.push(item.id)

    expect(item?.colors.map((color) => color.colorName)).toContain('Navy')
    expect(item?.variants.map((variant) => variant.size)).toEqual(
      expect.arrayContaining(['M', 'L']),
    )
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

  it('updates item defaults while preserving each receipt minimum price snapshot', async () => {
    const design = `Commercial defaults ${suffix}`
    const articleNumber = `DEFAULTS-${suffix}`
    const first = await createSupplyRouteReceiptServer({
      ...draft(design, articleNumber),
      lines: [
        {
          itemName: 'Shirt',
          design,
          articleNumber,
          minimumSellPriceUgx: '12000',
          lowStockThreshold: 5,
          quantity: 10,
          unitPriceForeign: '20',
        },
      ],
    })
    const second = await createSupplyRouteReceiptServer({
      ...draft(
        design,
        articleNumber,
        supplierId,
        first.lines[0].itemId ?? undefined,
      ),
      lines: [
        {
          itemName: 'Shirt',
          design,
          articleNumber,
          minimumSellPriceUgx: '15000',
          lowStockThreshold: 8,
          quantity: 10,
          unitPriceForeign: '25',
        },
      ],
    })
    const itemId = second.lines[0].itemId
    expect(itemId).toBeTruthy()
    const item = itemId
      ? await db.query.items.findFirst({ where: eq(items.id, itemId) })
      : undefined
    if (item) createdItemIds.push(item.id)

    expect(item).toMatchObject({
      minimumSellPriceUgx: '15000.00',
      lowStockThreshold: 8,
      costPrice: '25.00',
      costCurrency: 'RMB',
    })
    expect(first.lines[0].minimumSellPriceUgx).toBe('12000.00')
    expect(second.lines[0].minimumSellPriceUgx).toBe('15000.00')
  })

  it('rejects conflicting item defaults on duplicate rows in one receipt', async () => {
    const design = `Conflicting defaults ${suffix}`
    try {
      await expect(
        createSupplyRouteReceiptServer({
          ...draft(design, `CONFLICT-${suffix}`),
          lines: [
            {
              design,
              articleNumber: `CONFLICT-${suffix}`,
              minimumSellPriceUgx: '12000',
              lowStockThreshold: 5,
              quantity: 10,
              unitPriceForeign: '20',
            },
            {
              design,
              articleNumber: `CONFLICT-${suffix}`,
              minimumSellPriceUgx: '15000',
              lowStockThreshold: 5,
              quantity: 10,
              unitPriceForeign: '20',
            },
          ],
        }),
      ).rejects.toThrow('conflicting defaults')
    } finally {
      const created = await db.query.items.findFirst({
        where: eq(items.design, design),
      })
      if (created) createdItemIds.push(created.id)
    }
  })

  it('allows the same supplier art number for another supplier', async () => {
    const design = `Supplier-specific design ${suffix}`
    const articleNumber = `SUPPLIER-${suffix}`
    const first = await createSupplyRouteReceiptServer(
      draft(design, articleNumber),
    )
    if (first.lines[0].itemId) createdItemIds.push(first.lines[0].itemId)

    const second = await createSupplyRouteReceiptServer(
      draft(design, articleNumber, otherSupplierId),
    )
    expect(second.lines[0].itemId).not.toBe(first.lines[0].itemId)
    if (second.lines[0].itemId) createdItemIds.push(second.lines[0].itemId)
  })

  it('rejects an art number already owned by another item', async () => {
    await expect(
      createSupplyRouteReceiptServer(
        draft(`Different design ${suffix}`, `RA-${suffix}`),
      ),
    ).rejects.toThrow('Art number')
  })

  it('does not reuse another supplier item for a new art number', async () => {
    const design = `Separate supplier design ${suffix}`
    const first = await createSupplyRouteReceiptServer(
      draft(design, `FIRST-${suffix}`),
    )
    if (first.lines[0].itemId) createdItemIds.push(first.lines[0].itemId)
    const second = await createSupplyRouteReceiptServer(
      draft(
        design,
        `SECOND-${suffix}`,
        otherSupplierId,
        first.lines[0].itemId ?? undefined,
      ),
    )
    if (second.lines[0].itemId) createdItemIds.push(second.lines[0].itemId)

    expect(second.lines[0].itemId).not.toBe(first.lines[0].itemId)
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
