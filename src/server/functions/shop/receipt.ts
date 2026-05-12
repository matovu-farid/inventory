import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { shopSales, shops, customers } from "#/db/schema"
import { renderSaleReceipt } from "#/lib/pdf/receipt-html"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const getReceiptInput = z.object({ saleId: z.string().uuid() })

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

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.id, data.saleId),
      with: {
        items: {
          with: {
            shopStockItem: {
              with: { productColor: { with: { product: true } } },
            },
          },
        },
      },
    })
    if (!sale) throw new Error(`Sale not found: ${data.saleId}`)

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
      items: sale.items.map((i) => {
        const pc = i.shopStockItem.productColor
        const productName = `${pc.product.articleNumber} ${pc.product.name} · ${pc.colorName} / ${i.shopStockItem.size}`
        return {
          productName,
          quantity: i.quantity,
          unitPriceUgx: i.unitPriceUgx,
          totalPriceUgx: i.totalPriceUgx,
        }
      }),
    })
  })
