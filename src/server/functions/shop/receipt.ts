import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSessionAndRole } from '#/server/middleware/rbac'

const getReceiptInput = z.object({ saleId: z.uuid() })

/**
 * Render a printable HTML receipt for a sale. The browser can save it
 * to PDF via the print dialog. Returns the HTML string; the front-end
 * is expected to open it in a new window.
 *
 * The pure renderer lives in `./receipt-render.server.ts`; we dynamic-
 * import it so the client bundle of this module never reaches `#/db`.
 */
export const getSaleReceiptHtml = createServerFn()
  .inputValidator(getReceiptInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    const { buildSaleReceiptHtml } = await import('./receipt-render.server')
    return buildSaleReceiptHtml(data.saleId)
  })
