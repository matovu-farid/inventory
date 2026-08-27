import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { items, storeStock, shopStock } from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'

export const listItemStockPrices = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
      columns: { id: true, minimumSellPriceUgx: true },
    })
    if (!item) return { item: null, store: [], shop: [] }

    // Stock rows carry immutable lot snapshots. The item value is returned
    // separately as the current default for future stock.
    const [store, shop] = await Promise.all([
      db.query.storeStock.findMany({
        where: eq(storeStock.itemId, data.itemId),
        with: {
          store: { columns: { name: true } },
          variant: {
            with: {
              color: { columns: { colorName: true, colorHex: true } },
            },
          },
        },
      }),
      db.query.shopStock.findMany({
        where: eq(shopStock.itemId, data.itemId),
        with: {
          shop: { columns: { name: true } },
          variant: {
            with: {
              color: { columns: { colorName: true, colorHex: true } },
            },
          },
        },
      }),
    ])
    return { item, store, shop }
  })

const priceAmount = z
  .string()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, {
    message: 'Enter a non-negative amount',
  })

/**
 * Item-level minimum sell price default. Zero means no floor; stock rows keep
 * their own immutable snapshot for historical pricing.
 */
const setItemMinPriceInput = z.object({
  itemId: z.uuid(),
  minimumSellPriceUgx: priceAmount,
})

export const setItemMinimumSellPrice = createServerFn()
  .inputValidator(setItemMinPriceInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const updated = (
      await db
        .update(items)
        .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
        .where(eq(items.id, data.itemId))
        .returning()
    ).at(0)
    if (!updated) throw new Error('Item not found')
    return updated
  })

export const updateItemCommercialProfile = createServerFn()
  .inputValidator(
    z.object({
      itemId: z.uuid(),
      supplierId: z.uuid(),
      costPrice: priceAmount,
      costCurrency: z.enum(['RMB', 'USD', 'UGX']),
      minimumSellPriceUgx: priceAmount,
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    const updated = await db
      .update(items)
      .set({
        supplierId: data.supplierId,
        costPrice: data.costPrice,
        costCurrency: data.costCurrency,
        minimumSellPriceUgx: data.minimumSellPriceUgx,
      })
      .where(eq(items.id, data.itemId))
      .returning()
    if (!updated[0]) throw new Error('Item not found')
    return updated[0]
  })
