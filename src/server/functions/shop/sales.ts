import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  items,
  shops,
  shopSales,
  shopSaleLines,
  shopSaleLineAllocations,
  shopStock,
  customers,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import {
  depositCategoryFor,
  depositLocationFor,
} from "#/lib/payment-method"
import { formatItemLabel, formatItemLabelUnresolved } from "#/lib/items"
import { pickShopStockFifo } from "./fifo"
import { validateBelowMinimumSale } from "./sale-validate"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { getActorName } from "#/server/audit/actor"

export const getShopStock = createServerFn()
  .inputValidator(z.object({ shopId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])

    return db.query.shopStock.findMany({
      where: eq(shopStock.shopId, data.shopId),
      with: {
        // item-level join gives the item-wide minimum sell price and lets
        // unresolved rows render a label. `colors` is read by
        // SpecifyStockDialog on unresolved rows (Plan 2a Task 12).
        item: { with: { colors: true } },
        variant: { with: { color: { with: { item: true } } } },
      },
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
  const userId = session.user.id
  const role = session.user.role

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
  .inputValidator(z.object({ shopId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const userId = session.user.id
    const role = session.user.role

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
            // Plan 2b: lines carry item identity directly + optional variant.
            // `shopStockItem` is retained for backwards compat with audit
            // resolvers that still walk it; Plan 2c will sweep.
            item: true,
            variant: { with: { color: { with: { item: true } } } },
            shopStockItem: {
              with: { variant: { with: { color: { with: { item: true } } } } },
            },
          },
        },
        soldByUser: { columns: { id: true, name: true } },
      },
      orderBy: (s, { desc }) => [desc(s.saleDate)],
      limit: 100,
    })
  })

const saleItemInput = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
  quantity: z.number().int().positive(),
  unitPriceUgx: z.string(),
  belowMinimumReason: z.string().optional(),
})

const recordSaleInput = z.object({
  shopId: z.uuid(),
  paymentMethod: z.enum(["cash", "bank", "credit"]),
  bankAccountId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  items: z.array(saleItemInput).min(1),
  approvedBy: z.string().optional(),
  notes: z.string().optional(),
})

/**
 * Record a shop sale (Plan 2b — item-level).
 *
 * 1. Validate stock availability via `pickShopStockFifo` (per-item).
 * 2. Validate minimum-price + reason against item-level floor.
 * 3. Create sale + one sale-line per input item + N allocations per line.
 * 4. Decrement each source shop_stock lot by its allocation quantity.
 * 5. Post ledger: DR Cash/Bank/A/R, CR Sales Revenue; DR COGS, CR Inv-Shop.
 */
export const recordSale = createServerFn()
  .inputValidator(recordSaleInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const userId = session.user.id
    const userRole = session.user.role ?? ""

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

      const planned: Array<{
        itemId: string
        variantId: string | null
        quantity: number
        unitPrice: BigNumber
        totalPrice: BigNumber
        minimumSellPriceUgx: string
        isBelowMinimum: boolean
        belowMinimumReason: string | null
        allocations: Array<{
          shopStockId: string
          quantity: number
          costPerUnitUgx: string
          supplyRouteLineId: string | null
        }>
      }> = []

      for (const input of data.items) {
        const item = await tx.query.items.findFirst({
          where: eq(items.id, input.itemId),
          columns: {
            id: true,
            articleNumber: true,
            name: true,
            minimumSellPriceUgx: true,
          },
        })
        if (!item) throw new Error(`Item not found: ${input.itemId}`)

        const plan = await pickShopStockFifo(tx, {
          shopId: data.shopId,
          itemId: input.itemId,
          variantId: input.variantId,
          quantity: input.quantity,
        })
        if (plan.shortfall > 0) {
          throw new Error(
            `Insufficient stock for ${item.articleNumber} ${item.name}: ` +
              `short by ${plan.shortfall}`,
          )
        }

        // Item-level label (color/size optional). Used in below-minimum
        // validator error messages and the audit description fallback.
        const itemLabel = input.variantId
          ? formatItemLabel(item.articleNumber, item.name, "")
          : formatItemLabelUnresolved(item.articleNumber, item.name)

        const { isBelowMinimum, reason: belowMinimumReason } =
          validateBelowMinimumSale({
            unitPriceUgx: input.unitPriceUgx,
            minimumSellPriceUgx: item.minimumSellPriceUgx,
            userRole,
            reason: input.belowMinimumReason ?? "",
            itemName: itemLabel,
          })
        if (isBelowMinimum) hasBelowMinimum = true

        const unitPrice = new BigNumber(input.unitPriceUgx)
        const totalPrice = unitPrice.times(input.quantity)
        const lineCost = plan.allocations.reduce(
          (s, a) => s.plus(new BigNumber(a.costPerUnitUgx).times(a.quantity)),
          new BigNumber(0),
        )

        totalAmount = totalAmount.plus(totalPrice)
        totalCost = totalCost.plus(lineCost)

        planned.push({
          itemId: item.id,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          unitPrice,
          totalPrice,
          minimumSellPriceUgx: item.minimumSellPriceUgx,
          isBelowMinimum,
          belowMinimumReason,
          allocations: plan.allocations,
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

      for (const detail of planned) {
        const [line] = await tx
          .insert(shopSaleLines)
          .values({
            shopSaleId: sale.id,
            itemId: detail.itemId,
            variantId: detail.variantId,
            shopStockId: null,
            quantity: detail.quantity,
            unitPriceUgx: detail.unitPrice.toFixed(2),
            minimumPriceUgx: detail.minimumSellPriceUgx,
            isBelowMinimum: detail.isBelowMinimum,
            belowMinimumReason: detail.belowMinimumReason,
            totalPriceUgx: detail.totalPrice.toFixed(2),
          })
          .returning()

        for (const alloc of detail.allocations) {
          await tx.insert(shopSaleLineAllocations).values({
            shopSaleLineId: line.id,
            shopStockId: alloc.shopStockId,
            supplyRouteLineId: alloc.supplyRouteLineId,
            quantity: alloc.quantity,
            costPerUnitUgx: alloc.costPerUnitUgx,
          })
          // Decrement source row.
          const sourceRow = await tx.query.shopStock.findFirst({
            where: eq(shopStock.id, alloc.shopStockId),
            columns: { quantityOnHand: true },
          })
          if (!sourceRow) {
            throw new Error(
              `FIFO plan referenced missing shop_stock row ${alloc.shopStockId}`,
            )
          }
          await tx
            .update(shopStock)
            .set({ quantityOnHand: sourceRow.quantityOnHand - alloc.quantity })
            .where(eq(shopStock.id, alloc.shopStockId))
        }
      }

      const debitCategory =
        data.paymentMethod === "credit"
          ? "Accounts Receivable"
          : depositCategoryFor(data.paymentMethod)

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
        depositLocation: depositLocationFor(data.paymentMethod),
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Sale ${docNumber.formatted} (${data.items.length} items)`,
      })

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

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "sale.create",
        entityType: "shop_sale",
        entityId: sale.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "sale.create",
        entityType: "shop_sale",
        entityId: sale.id,
        description: renderAuditDescription("sale.create", {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
          totalAmount: totalAmount.toFixed(2),
          paymentMethod: data.paymentMethod,
        }),
        articleNumbers,
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
