import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { shopSales, shopSaleItems, shopStock } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const getShopStock = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])

    return db.query.shopStock.findMany({
      where: eq(shopStock.shopId, data.shopId),
      orderBy: (s, { asc }) => [asc(s.productName)],
    })
  })

export const listShopSales = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])

    return db.query.shopSales.findMany({
      where: eq(shopSales.shopId, data.shopId),
      with: { items: true },
      orderBy: (s, { desc }) => [desc(s.saleDate)],
      limit: 100,
    })
  })

const saleItemInput = z.object({
  shopStockId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPriceUgx: z.string(),
})

const recordSaleInput = z.object({
  shopId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "bank"]),
  bankAccountId: z.string().uuid().optional(),
  items: z.array(saleItemInput).min(1),
  approvedBy: z.string().optional(),
  notes: z.string().optional(),
})

/**
 * Record a shop sale.
 *
 * 1. Validate stock and minimum price enforcement
 * 2. Create sale + sale items
 * 3. Decrement shop stock
 * 4. Post ledger: DR Cash/Bank, CR Sales Revenue
 *                 DR Cost of Goods Sold, CR Inventory-Shop
 */
export const recordSale = createServerFn()
  .inputValidator(recordSaleInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const userId = (session.user as { id: string }).id
    const userRole = (session.user as { role: string }).role

    return db.transaction(async (tx) => {
      let totalAmount = new BigNumber(0)
      let totalCost = new BigNumber(0)
      let hasBelowMinimum = false

      // Validate all items first
      const itemDetails: Array<{
        stock: typeof shopStock.$inferSelect
        quantity: number
        unitPrice: BigNumber
        totalPrice: BigNumber
        costPerUnit: BigNumber
        isBelowMinimum: boolean
      }> = []

      for (const item of data.items) {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, item.shopStockId),
        })
        if (!stock) throw new Error(`Stock item not found: ${item.shopStockId}`)
        if (stock.quantityOnHand < item.quantity) {
          throw new Error(
            `Insufficient stock for ${stock.productName}: have ${stock.quantityOnHand}, need ${item.quantity}`,
          )
        }

        const unitPrice = new BigNumber(item.unitPriceUgx)
        const minPrice = new BigNumber(stock.minimumSellPriceUgx)
        const isBelowMinimum = unitPrice.lt(minPrice)

        if (isBelowMinimum) {
          hasBelowMinimum = true
          // Below-minimum sales always require explicit approval from admin/supervisor
          if (userRole === "sales") {
            throw new Error(
              `Sale price ${unitPrice.toFixed(0)} is below minimum ${minPrice.toFixed(0)} for ${stock.productName}. Requires supervisor approval.`,
            )
          }
        }

        const tp = unitPrice.times(item.quantity)
        totalAmount = totalAmount.plus(tp)
        totalCost = totalCost.plus(
          new BigNumber(stock.costPerUnitUgx).times(item.quantity),
        )

        itemDetails.push({
          stock,
          quantity: item.quantity,
          unitPrice,
          totalPrice: tp,
          costPerUnit: new BigNumber(stock.costPerUnitUgx),
          isBelowMinimum,
        })
      }

      // Create sale header
      const [sale] = await tx
        .insert(shopSales)
        .values({
          shopId: data.shopId,
          saleDate: new Date(),
          soldBy: userId,
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          totalAmount: totalAmount.toFixed(2),
          approvedBy: hasBelowMinimum ? userId : undefined,
          notes: data.notes,
        })
        .returning()

      // Create sale items + update stock
      for (const detail of itemDetails) {
        await tx.insert(shopSaleItems).values({
          shopSaleId: sale.id,
          shopStockId: detail.stock.id,
          productName: detail.stock.productName,
          quantity: detail.quantity,
          unitPriceUgx: detail.unitPrice.toFixed(2),
          minimumPriceUgx: detail.stock.minimumSellPriceUgx,
          isBelowMinimum: detail.isBelowMinimum,
          totalPriceUgx: detail.totalPrice.toFixed(2),
        })

        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} - ${detail.quantity}`,
          })
          .where(eq(shopStock.id, detail.stock.id))
      }

      // Post ledger: revenue
      await postJournalEntry(tx, {
        entries: [
          {
            type: "debit",
            category: data.paymentMethod === "cash" ? "Cash" : "Bank",
            amount: totalAmount.toFixed(2),
          },
          { type: "credit", category: "Sales Revenue", amount: totalAmount.toFixed(2) },
        ],
        referenceType: "shop_sale",
        referenceId: sale.id,
        locationType: "shop",
        locationId: data.shopId,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Sale of ${data.items.length} items`,
      })

      // Post ledger: COGS
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Cost of Goods Sold", amount: totalCost.toFixed(2) },
          { type: "credit", category: "Inventory - Shop", amount: totalCost.toFixed(2) },
        ],
        referenceType: "shop_sale",
        referenceId: sale.id,
        locationType: "shop",
        locationId: data.shopId,
        recordedBy: userId,
        description: `COGS for sale`,
      })

      return sale
    })
  })
