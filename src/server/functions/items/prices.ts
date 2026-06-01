import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { items, storeStock, shopStock } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listItemStockPrices = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
      columns: { id: true, minimumSellPriceUgx: true },
    })
    if (!item) return { item: null, store: [], shop: [] }

    // Both store and shop stock now key on item_id directly. Min sell
    // price lives on `items.minimumSellPriceUgx` — the callers read it
    // from `item.minimumSellPriceUgx` rather than from any per-row column.
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
    message: "Enter a non-negative amount",
  })

/**
 * Item-level minimum sell price. The single writer for the floor; both
 * store and shop callers honour `items.minimumSellPriceUgx` at the
 * item level (Plan 2b removed the per-shop-stock-row floor entirely).
 */
const setItemMinPriceInput = z.object({
  itemId: z.uuid(),
  minimumSellPriceUgx: priceAmount,
})

export const setItemMinimumSellPrice = createServerFn()
  .inputValidator(setItemMinPriceInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const updated = (
      await db
        .update(items)
        .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
        .where(eq(items.id, data.itemId))
        .returning()
    ).at(0)
    if (!updated) throw new Error("Item not found")
    return updated
  })
