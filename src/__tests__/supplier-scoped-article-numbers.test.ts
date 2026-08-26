import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '#/db'
import {
  itemArticleNumbers,
  items,
  supplierCodes,
  suppliers,
} from '#/db/schema'
import {
  formatItemArticleNumbers,
  normalizeArticleNumber,
} from '#/lib/items/article-number'
import { qualifiedArticleNumber } from '#/lib/suppliers/supplier-code'
import { searchItemsQuery } from '#/server/functions/items/items.server'

const suffix = crypto.randomUUID()
const supplierNames = [`Scoped supplier A ${suffix}`, `Scoped supplier B ${suffix}`]
let supplierIds: string[] = []
let itemIds: string[] = []

describe('supplier-scoped article numbers', () => {
  beforeAll(async () => {
    const createdSuppliers = await db
      .insert(suppliers)
      .values(
        supplierNames.map((name) => ({
          name,
          type: 'international' as const,
        })),
      )
      .returning({ id: suppliers.id })
    supplierIds = createdSuppliers.map((supplier) => supplier.id)
    await db.insert(supplierCodes).values([
      { supplierId: supplierIds[0], code: 'ABCDEFGH' },
      { supplierId: supplierIds[1], code: 'IJKLMNOP' },
    ])
    const createdItems = await db
      .insert(items)
      .values([
        {
          name: 'Shirt',
          design: 'Round Neck',
          supplierId: supplierIds[0],
        },
        {
          name: 'Shirt',
          design: 'Round Neck',
          supplierId: supplierIds[1],
        },
      ])
      .returning({ id: items.id })
    itemIds = createdItems.map((item) => item.id)
  })

  afterAll(async () => {
    if (itemIds.length > 0) {
      await db
        .delete(itemArticleNumbers)
        .where(inArray(itemArticleNumbers.itemId, itemIds))
      await db.delete(items).where(inArray(items.id, itemIds))
    }
    if (supplierIds.length > 0) {
      await db
        .delete(supplierCodes)
        .where(inArray(supplierCodes.supplierId, supplierIds))
      await db.delete(suppliers).where(inArray(suppliers.id, supplierIds))
    }
  })

  it('allows the same visible number for different suppliers', async () => {
    const visible = normalizeArticleNumber(' jacket 101 ')
    await db.insert(itemArticleNumbers).values([
      {
        itemId: itemIds[0],
        articleNumber: visible,
        qualifiedArticleNumber: qualifiedArticleNumber('ABCDEFGH', visible),
      },
      {
        itemId: itemIds[1],
        articleNumber: visible,
        qualifiedArticleNumber: qualifiedArticleNumber('IJKLMNOP', visible),
      },
    ])

    const stored = await db.query.itemArticleNumbers.findMany({
      where: and(
        eq(itemArticleNumbers.articleNumber, visible),
        inArray(itemArticleNumbers.itemId, itemIds),
      ),
    })
    expect(stored.map((row) => row.qualifiedArticleNumber).sort()).toEqual([
      'ABCDEFGH:JACKET 101',
      'IJKLMNOP:JACKET 101',
    ])
  })

  it('continues formatting only the visible article number', () => {
    expect(
      formatItemArticleNumbers([{ articleNumber: 'JACKET 101' }]),
    ).toBe('JACKET 101')
  })

  it('ranks exact art-number matches and scopes them to the supplier', async () => {
    const visible = 'JACKET 101'
    const results = await searchItemsQuery({
      query: visible,
      supplierId: supplierIds[0],
    })

    expect(results[0]?.id).toBe(itemIds[0])
    expect(results.some((item) => item.id === itemIds[1])).toBe(false)
  })
})
