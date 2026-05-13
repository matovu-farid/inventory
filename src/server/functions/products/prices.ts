import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { storeStock, shopStock, productColors } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listProductStockPrices = createServerFn()
  .inputValidator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const colors = await db.query.productColors.findMany({
      where: eq(productColors.productId, data.productId),
      columns: { id: true },
    })
    const colorIds = colors.map((c) => c.id)
    if (colorIds.length === 0) return { store: [], shop: [] }

    const [store, shop] = await Promise.all([
      db.query.storeStock.findMany({
        where: (t, { inArray }) => inArray(t.productColorId, colorIds),
        with: {
          store: { columns: { name: true } },
          productColor: { columns: { colorName: true, colorHex: true } },
        },
      }),
      db.query.shopStock.findMany({
        where: (t, { inArray }) => inArray(t.productColorId, colorIds),
        with: {
          shop: { columns: { name: true } },
          productColor: { columns: { colorName: true, colorHex: true } },
        },
      }),
    ])
    return { store, shop }
  })

const setPriceInput = z.object({
  stockType: z.enum(["store", "shop"]),
  stockId: z.string().uuid(),
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
