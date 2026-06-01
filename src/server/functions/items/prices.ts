import { createServerFn } from "@tanstack/react-start"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  items,
  storeStock,
  shopStock,
  itemColors,
  variants,
} from "#/db/schema"
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

    // Store stock is now anchored on item_id directly (Task 2) — query
    // there straight away so unresolved (variant_id NULL) lots are
    // included. Shop stock still keys on variant_id until Plan 2.
    const colors = await db.query.itemColors.findMany({
      where: eq(itemColors.itemId, data.itemId),
      columns: { id: true },
    })
    const colorIds = colors.map((c) => c.id)
    const variantRows =
      colorIds.length === 0
        ? []
        : await db.query.variants.findMany({
            where: inArray(variants.colorId, colorIds),
            columns: { id: true },
          })
    const variantIds = variantRows.map((v) => v.id)

    const [store, shop] = await Promise.all([
      // Store rows no longer carry their own minimum sell price (it lives
      // on `items.minimumSellPriceUgx` after variant-flexibility Task 2).
      // The route consumer reads `item.minimumSellPriceUgx` for the store
      // floor and uses these rows only for qty/location display.
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
      variantIds.length === 0
        ? Promise.resolve([])
        : db.query.shopStock.findMany({
            where: inArray(shopStock.variantId, variantIds),
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
    // Shop stock used to carry its own `minimumSellPriceUgx`; after the
    // schema flip the floor lives on the item itself. Synthesize the field
    // on the returned shop rows so callers don't have to thread a second
    // value through their types. Plan 2b will rewrite the editor UI to
    // treat the floor as item-level for shops as well; until then this
    // surfaces the item-level floor at every shop row.
    const itemFloor = item.minimumSellPriceUgx
    const shopWithFloor = shop.map((s) => ({
      ...s,
      minimumSellPriceUgx: itemFloor,
    }))
    return { item, store, shop: shopWithFloor }
  })

const priceAmount = z
  .string()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, {
    message: "Enter a non-negative amount",
  })

/**
 * Item-level minimum sell price.
 *
 * Replaced the old per-`storeStock`-row `setMinimumSellPrice` after
 * variant-flexibility Task 2 dropped `store_stock.minimum_sell_price_ugx`
 * and moved the floor up to `items.minimum_sell_price_ugx` — the price
 * is an item-wide rule now, not a per-lot setting.
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

/**
 * Used to write a per-row shop_stock minimum sell price; after the
 * shop_stock schema flip (variant-flexibility Plan 2 Task 1) that column
 * is gone and the floor lives on the parent item.
 *
 * Plan 2b will rewrite the price-editor UI to set the floor at the item
 * level for shops too. For now this server fn resolves the shop_stock
 * row's parent item and forwards the write to `items.minimumSellPriceUgx`
 * so the existing UI keeps working without surfacing a hard error.
 */
const setShopStockMinPriceInput = z.object({
  shopStockId: z.uuid(),
  minimumSellPriceUgx: priceAmount,
})

export const setShopStockMinimumPrice = createServerFn()
  .inputValidator(setShopStockMinPriceInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const row = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, data.shopStockId),
      columns: { itemId: true },
    })
    if (!row) throw new Error("Shop stock row not found")

    const updated = (
      await db
        .update(items)
        .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
        .where(eq(items.id, row.itemId))
        .returning()
    ).at(0)
    if (!updated) throw new Error("Item not found")
    return updated
  })
