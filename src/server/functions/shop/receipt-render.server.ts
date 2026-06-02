import "@tanstack/react-start/server-only"
import { eq } from "drizzle-orm"
import { db } from "#/db"
import { shopSales, shops, customers } from "#/db/schema"
import { renderSaleReceipt } from "#/lib/pdf/receipt-html"

/**
 * Pure renderer — lives in a `.server.ts` companion so the client bundle
 * of `receipt.ts` can be split cleanly. Tests import this module
 * directly to exercise item-level branching without going through
 * `runWithStartContext` (which swallows return values).
 */
export async function buildSaleReceiptHtml(saleId: string): Promise<string> {
  const sale = await db.query.shopSales.findFirst({
    where: eq(shopSales.id, saleId),
    with: {
      items: {
        with: {
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
