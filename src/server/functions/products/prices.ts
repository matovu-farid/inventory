import { createServerFn } from "@tanstack/react-start"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { storeStock, shopStock, itemColors, variants } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listProductStockPrices = createServerFn()
  .inputValidator(z.object({ productId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const colors = await db.query.itemColors.findMany({
      where: eq(itemColors.itemId, data.productId),
      columns: { id: true },
    })
    const colorIds = colors.map((c) => c.id)
    if (colorIds.length === 0) return { store: [], shop: [] }

    // Stock now references variant_id (issue #4). Resolve every variant
    // that belongs to one of the product's colors and look stock up by
    // variant_id.
    const variantRows = await db.query.variants.findMany({
      where: inArray(variants.colorId, colorIds),
      columns: { id: true },
    })
    const variantIds = variantRows.map((v) => v.id)
    if (variantIds.length === 0) return { store: [], shop: [] }

    const [store, shop] = await Promise.all([
      db.query.storeStock.findMany({
        where: inArray(storeStock.variantId, variantIds),
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
    return { store, shop }
  })

const setPriceInput = z.object({
  stockType: z.enum(["store", "shop"]),
  stockId: z.uuid(),
  minimumSellPriceUgx: z
    .string()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0, {
      message: "Enter a non-negative amount",
    }),
})

export const setStockMinimumPrice = createServerFn()
  .inputValidator(setPriceInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    if (data.stockType === "store") {
      const updated = (
        await db
          .update(storeStock)
          .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
          .where(eq(storeStock.id, data.stockId))
          .returning()
      ).at(0)
      if (!updated) throw new Error("Store stock row not found")
      return updated
    }

    const updated = (
      await db
        .update(shopStock)
        .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
        .where(eq(shopStock.id, data.stockId))
        .returning()
    ).at(0)
    if (!updated) throw new Error("Shop stock row not found")
    return updated
  })
