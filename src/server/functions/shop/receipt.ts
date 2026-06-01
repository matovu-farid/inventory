import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { shopSales, shops, customers } from "#/db/schema"
import { renderSaleReceipt } from "#/lib/pdf/receipt-html"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const getReceiptInput = z.object({ saleId: z.uuid() })

/**
 * Pure renderer — exported so unit tests can exercise the item-level
 * branching without going through `runWithStartContext` (which swallows
 * return values).
 */
export async function buildSaleReceiptHtml(saleId: string): Promise<string> {
  const sale = await db.query.shopSales.findFirst({
    where: eq(shopSales.id, saleId),
    with: {
      items: {
        with: {
          // Plan 2b: lines carry item identity directly. Variant is
          // optional — unresolved sale lines have null variantId.
          item: true,
          variant: { with: { color: true } },
        },
      },
      soldByUser: { columns: { id: true, name: true } },
    },
  })
  if (!sale) throw new Error(`Sale not found: ${saleId}`)

  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, sale.shopId),
  })
  const customer = sale.customerId
    ? await db.query.customers.findFirst({
        where: eq(customers.id, sale.customerId),
      })
    : null

  return renderSaleReceipt({
    documentNumber: sale.documentNumber,
    saleDate: sale.saleDate,
    shopName: shop?.name ?? "Shop",
    totalAmount: sale.totalAmount,
    paymentMethod: sale.paymentMethod,
    customerName: customer?.name ?? null,
    clerkName: sale.soldByUser.name,
    items: sale.items.map((i) => {
      const itemName = i.variant
        ? `${i.item.articleNumber} ${i.item.name} · ${i.variant.color.colorName} / ${i.variant.size}`
        : `${i.item.articleNumber} ${i.item.name}`
      return {
        itemName,
        quantity: i.quantity,
        unitPriceUgx: i.unitPriceUgx,
        totalPriceUgx: i.totalPriceUgx,
      }
    }),
  })
}

/**
 * Render a printable HTML receipt for a sale. The browser can save it
 * to PDF via the print dialog. Returns the HTML string; the front-end
 * is expected to open it in a new window.
 */
export const getSaleReceiptHtml = createServerFn()
  .inputValidator(getReceiptInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return buildSaleReceiptHtml(data.saleId)
  })
