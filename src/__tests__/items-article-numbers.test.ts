import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { itemArticleNumbers, items, suppliers } from '#/db/schema'
import {
  addItemArticleNumberQuery,
  createItemQuery,
  getItemByArticleQuery,
  removeItemArticleNumberQuery,
  replaceItemArticleNumbersQuery,
  searchItemsQuery,
} from '#/server/functions/items/items.server'

const suffix = `article-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const itemIds: string[] = []
let supplierId = ''

beforeAll(async () => {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: `Article supplier ${suffix}`, type: 'international' })
    .returning()
  supplierId = supplier.id
})

afterAll(async () => {
  if (itemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, itemIds))
  }
  if (supplierId) {
    await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  }
})

async function createItem(articleNumbers: string[]) {
  const item = await createItemQuery({
    name: `Article item ${articleNumbers[0]}`,
    design: 'Round neck',
    articleNumbers,
    supplierId,
    costPrice: '10',
    costCurrency: 'RMB',
    minimumSellPriceUgx: '50000',
    sizes: [],
    colors: [],
  })
  itemIds.push(item.id)
  return item
}

describe('item article-number relationship', () => {
  it('creates one priced item with multiple normalized article numbers', async () => {
    const item = await createItem([` tee-${suffix}-a `, `tee-${suffix}-b`])

    expect(item.articleNumbers.map((row) => row.articleNumber)).toEqual([
      `TEE-${suffix.toUpperCase()}-A`,
      `TEE-${suffix.toUpperCase()}-B`,
    ])
    expect(item.minimumSellPriceUgx).toBe('50000.00')
    expect(
      (await getItemByArticleQuery({ articleNumber: ` tee-${suffix}-b ` }))?.id,
    ).toBe(item.id)
    expect((await searchItemsQuery({ query: `TEE-${suffix}-A` }))[0]?.id).toBe(
      item.id,
    )
  })

  it('rejects duplicates within an item and across items', async () => {
    await expect(
      createItemQuery({
        name: `Duplicate item ${suffix}`,
        design: 'Round neck',
        articleNumbers: [` DUP-${suffix} `, `dup-${suffix}`],
        supplierId,
        costPrice: '10',
        costCurrency: 'RMB',
        minimumSellPriceUgx: '50000',
        sizes: [],
        colors: [],
      }),
    ).rejects.toThrow('Article numbers must be unique')

    const existing = await createItem([`cross-${suffix}`])
    await expect(
      createItemQuery({
        name: `Cross duplicate ${suffix}`,
        design: 'Round neck',
        articleNumbers: [` CROSS-${suffix} `],
        supplierId,
        costPrice: '10',
        costCurrency: 'RMB',
        minimumSellPriceUgx: '50000',
        sizes: [],
        colors: [],
      }),
    ).rejects.toThrow('Article number already belongs to another item')

    const crossNumbers = await db.query.itemArticleNumbers.findMany({
      where: eq(
        itemArticleNumbers.articleNumber,
        `CROSS-${suffix.toUpperCase()}`,
      ),
    })
    expect(crossNumbers).toHaveLength(1)
    expect(crossNumbers[0].itemId).toBe(existing.id)
  })

  it('supports adding and replacing later while protecting the final number', async () => {
    const item = await createItem([`later-${suffix}`])
    const added = await addItemArticleNumberQuery({
      itemId: item.id,
      articleNumber: ` later-two-${suffix} `,
    })
    expect(added.articleNumber).toBe(`LATER-TWO-${suffix.toUpperCase()}`)

    const replaced = await replaceItemArticleNumbersQuery({
      itemId: item.id,
      articleNumbers: [`later-three-${suffix}`, `later-four-${suffix}`],
    })
    expect(replaced.map((row) => row.articleNumber)).toEqual([
      `LATER-FOUR-${suffix.toUpperCase()}`,
      `LATER-THREE-${suffix.toUpperCase()}`,
    ])

    await expect(
      removeItemArticleNumberQuery({
        itemId: item.id,
        articleNumberId: replaced[0].id,
      }),
    ).resolves.toBeDefined()
    await expect(
      removeItemArticleNumberQuery({
        itemId: item.id,
        articleNumberId: replaced[1].id,
      }),
    ).rejects.toThrow('at least one article number')

    const remaining = await db.query.itemArticleNumbers.findMany({
      where: eq(itemArticleNumbers.itemId, item.id),
    })
    expect(remaining).toHaveLength(1)
  })
})
