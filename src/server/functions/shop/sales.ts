import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { shops, shopSales, shopSaleItems, shopStock, customers } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateBelowMinimumSale } from "./sale-validate"

export const getShopStock = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])

    return db.query.shopStock.findMany({
      where: eq(shopStock.shopId, data.shopId),
      with: { productColor: { with: { product: true } } },
      orderBy: (s, { asc }) => [asc(s.size)],
    })
  })

/**
 * Shops with at least one recorded sale visible to the caller.
 * For sales reps, "visible" means sales they personally recorded.
 * Used by the Sales page to keep the shop dropdown free of empty options.
 */
export const listShopsWithSales = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  const userId = (session.user as { id: string }).id
  const role = (session.user as { role?: string }).role

  const rows = await db
    .selectDistinct({ shopId: shopSales.shopId })
    .from(shopSales)
    .where(role === "sales" ? eq(shopSales.soldBy, userId) : undefined)

  if (rows.length === 0) return []

  return db
    .select()
    .from(shops)
    .where(inArray(shops.id, rows.map((r) => r.shopId)))
    .orderBy(shops.name)
})

export const listShopSales = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const userId = (session.user as { id: string }).id
    const role = (session.user as { role?: string }).role

    // Sales reps see only their own sales. Admin/supervisor see everything.
    const where =
      role === "sales"
        ? and(eq(shopSales.shopId, data.shopId), eq(shopSales.soldBy, userId))
        : eq(shopSales.shopId, data.shopId)

    return db.query.shopSales.findMany({
      where,
      with: {
        items: {
          with: {
            shopStockItem: {
              with: { productColor: { with: { product: true } } },
            },
          },
        },
      },
      orderBy: (s, { desc }) => [desc(s.saleDate)],
      limit: 100,
    })
  })

const saleItemInput = z.object({
  shopStockId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPriceUgx: z.string(),
  belowMinimumReason: z.string().optional(),
})

const recordSaleInput = z.object({
  shopId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "bank", "credit"]),
  bankAccountId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
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

    if (data.paymentMethod === "credit") {
      if (userRole === "sales") {
        throw new Error(
          "Only admin or supervisor can authorize a credit sale.",
        )
      }
      if (!data.customerId) {
        throw new Error("customerId is required for credit sales.")
      }
    }

    return db.transaction(async (tx) => {
      // Verify customer exists when this is a credit sale
      if (data.paymentMethod === "credit" && data.customerId) {
        const customer = await tx.query.customers.findFirst({
          where: eq(customers.id, data.customerId),
        })
        if (!customer || customer.deletedAt) {
          throw new Error(`Customer not found: ${data.customerId}`)
        }
      }
      let totalAmount = new BigNumber(0)
      let totalCost = new BigNumber(0)
      let hasBelowMinimum = false

      // Validate all items first
      const itemDetails: Array<{
        stockId: string
        costPerUnitUgx: string
        minimumSellPriceUgx: string
        quantity: number
        unitPrice: BigNumber
        totalPrice: BigNumber
        costPerUnit: BigNumber
        isBelowMinimum: boolean
        belowMinimumReason: string | null
      }> = []

      for (const item of data.items) {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, item.shopStockId),
          with: { productColor: { with: { product: true } } },
        })
        if (!stock) throw new Error(`Stock item not found: ${item.shopStockId}`)
        const productLabel = `${stock.productColor.product.articleNumber} ${stock.productColor.colorName}/${stock.size}`
        if (stock.quantityOnHand < item.quantity) {
          throw new Error(
            `Insufficient stock for ${productLabel}: have ${stock.quantityOnHand}, need ${item.quantity}`,
          )
        }

        const { isBelowMinimum, reason: belowMinimumReason } =
          validateBelowMinimumSale({
            unitPriceUgx: item.unitPriceUgx,
            minimumSellPriceUgx: stock.minimumSellPriceUgx,
            userRole,
            reason: item.belowMinimumReason ?? "",
            productName: productLabel,
          })
        if (isBelowMinimum) hasBelowMinimum = true

        const unitPrice = new BigNumber(item.unitPriceUgx)
        const tp = unitPrice.times(item.quantity)
        totalAmount = totalAmount.plus(tp)
        totalCost = totalCost.plus(
          new BigNumber(stock.costPerUnitUgx).times(item.quantity),
        )

        itemDetails.push({
          stockId: stock.id,
          costPerUnitUgx: stock.costPerUnitUgx,
          minimumSellPriceUgx: stock.minimumSellPriceUgx,
          quantity: item.quantity,
          unitPrice,
          totalPrice: tp,
          costPerUnit: new BigNumber(stock.costPerUnitUgx),
          isBelowMinimum,
          belowMinimumReason,
        })
      }

      const isCredit = data.paymentMethod === "credit"
      const docNumber = await nextDocumentNumber(tx, "SALE")

      const [sale] = await tx
        .insert(shopSales)
        .values({
          shopId: data.shopId,
          saleDate: new Date(),
          soldBy: userId,
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          customerId: isCredit ? data.customerId : null,
          totalAmount: totalAmount.toFixed(2),
          paymentStatus: isCredit ? "open" : "settled",
          outstandingBalance: isCredit ? totalAmount.toFixed(2) : "0",
          approvedBy: isCredit || hasBelowMinimum ? userId : undefined,
          documentNumber: docNumber.formatted,
          notes: data.notes,
        })
        .returning()

      // Create sale items + update stock
      for (const detail of itemDetails) {
        await tx.insert(shopSaleItems).values({
          shopSaleId: sale.id,
          shopStockId: detail.stockId,
          quantity: detail.quantity,
          unitPriceUgx: detail.unitPrice.toFixed(2),
          minimumPriceUgx: detail.minimumSellPriceUgx,
          isBelowMinimum: detail.isBelowMinimum,
          belowMinimumReason: detail.belowMinimumReason,
          totalPriceUgx: detail.totalPrice.toFixed(2),
        })

        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} - ${detail.quantity}`,
          })
          .where(eq(shopStock.id, detail.stockId))
      }

      const debitCategory = isCredit
        ? "Accounts Receivable"
        : data.paymentMethod === "cash"
          ? "Cash"
          : "Bank"

      await postJournalEntry(tx, {
        entries: [
          {
            type: "debit",
            category: debitCategory,
            amount: totalAmount.toFixed(2),
          },
          { type: "credit", category: "Sales Revenue", amount: totalAmount.toFixed(2) },
        ],
        referenceType: "shop_sale",
        referenceId: sale.id,
        locationType: "shop",
        locationId: data.shopId,
        depositLocation: isCredit
          ? undefined
          : (data.paymentMethod as "cash" | "bank"),
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Sale ${docNumber.formatted} (${data.items.length} items)`,
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

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "sale.create",
        entityType: "shop_sale",
        entityId: sale.id,
        after: {
          shopId: data.shopId,
          documentNumber: docNumber.formatted,
          paymentMethod: data.paymentMethod,
          totalAmountUgx: totalAmount.toFixed(2),
          paymentStatus: isCredit ? "open" : "settled",
          customerId: isCredit ? data.customerId : null,
        },
        metadata: {
          itemCount: data.items.length,
          totalCostUgx: totalCost.toFixed(2),
          hasBelowMinimum,
          bankAccountId: data.bankAccountId,
        },
      })

      return sale
    })
  })
