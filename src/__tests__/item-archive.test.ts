import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { items, suppliers } from '#/db/schema'
import {
  archiveItemQuery,
  createItemQuery,
  listItemsQuery,
  restoreItemQuery,
  searchItemsQuery,
} from '#/server/functions/items/items.server'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let supplierId = ''
let itemId = ''

afterAll(async () => {
  if (itemId) await db.delete(items).where(eq(items.id, itemId))
  if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId))
})

describe('item archive lifecycle', () => {
  beforeAll(async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({
        name: `Archive item supplier ${suffix}`,
        type: 'international',
      })
      .returning()
    supplierId = supplier.id
    const item = await createItemQuery({
      name: `Archive item ${suffix}`,
      design: `Archive design ${suffix}`,
      articleNumbers: [`ARCH-${suffix}`],
      supplierId,
      costPrice: '10',
      costCurrency: 'RMB',
      minimumSellPriceUgx: '50000',
      sizes: [],
      colors: [],
    })
    itemId = item.id
  })

  beforeEach(async () => {
    await db.update(items).set({ deletedAt: null }).where(eq(items.id, itemId))
  })

  it('excludes archived items from default list and search', async () => {
    await archiveItemQuery({ id: itemId })

    expect((await listItemsQuery()).some((item) => item.id === itemId)).toBe(
      false,
    )
    expect(
      (await searchItemsQuery({ query: `ARCH-${suffix}` })).some(
        (item) => item.id === itemId,
      ),
    ).toBe(false)
  })

  it('returns archived items only when explicitly requested', async () => {
    await archiveItemQuery({ id: itemId })
    const archived = await searchItemsQuery({
      query: `ARCH-${suffix}`,
      includeArchived: true,
    })
    expect(
      archived.find((item) => item.id === itemId)?.deletedAt,
    ).not.toBeNull()
  })

  it('restores an archived item', async () => {
    await archiveItemQuery({ id: itemId })
    const restored = await restoreItemQuery({ id: itemId })
    expect(restored.deletedAt).toBeNull()
    expect((await listItemsQuery()).some((item) => item.id === itemId)).toBe(
      true,
    )
  })
})
