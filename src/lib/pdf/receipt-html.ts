import { formatUgx, formatUgxTotal } from '#/lib/format'

interface SaleItemForReceipt {
  itemName: string
  quantity: number
  unitPriceUgx: string
  totalPriceUgx: string
}

interface SaleForReceipt {
  documentNumber: string | null
  saleDate: Date
  shopName: string
  totalAmount: string
  paymentMethod: 'cash' | 'bank' | 'credit'
  customerName?: string | null
  clerkName?: string | null
  items: SaleItemForReceipt[]
}

/**
 * Render a print-friendly HTML receipt that the browser can save as PDF
 * via the print dialog. Lighter than embedding @react-pdf and works on
 * Cloudflare Workers without bundle bloat.
 */
export function renderSaleReceipt(sale: SaleForReceipt): string {
  const dateStr = sale.saleDate.toLocaleString('en-UG', {
    timeZone: 'Africa/Kampala',
  })
  const itemRows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.itemName)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${formatUgx(item.unitPriceUgx)}</td>
          <td class="num">${formatUgx(item.totalPriceUgx)}</td>
        </tr>
      `,
    )
    .join('')

  const customerLine = sale.customerName
    ? `<div><strong>Customer:</strong> ${escapeHtml(sale.customerName)}</div>`
    : ''

  const clerkLine = sale.clerkName
    ? `<div><strong>Clerk:</strong> ${escapeHtml(sale.clerkName)}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(sale.documentNumber ?? 'Receipt')}</title>
    <style>
      /* Screen: A4-friendly preview */
      body { font-family: system-ui, sans-serif; margin: 24px; color: #111; max-width: 720px; }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .total { margin-top: 12px; text-align: right; font-weight: bold; font-size: 14px; }
      .payment { margin-top: 4px; font-size: 12px; color: #444; text-align: right; }
      .toolbar { margin-top: 24px; display: flex; gap: 8px; }
      .toolbar button { padding: 8px 14px; cursor: pointer; }

      /* 80mm thermal printer layout */
      @media print {
        @page { size: 80mm auto; margin: 0; }
        body {
          margin: 0;
          padding: 4mm;
          width: 72mm;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px;
          color: #000;
        }
        h1 { font-size: 13px; margin: 0 0 4px 0; text-align: center; }
        .meta { margin-bottom: 6px; font-size: 10px; }
        .meta div { display: block; }
        table { font-size: 10px; }
        th, td { padding: 2px 0; border: 0; border-bottom: 1px dashed #888; }
        thead tr { border-bottom: 1px solid #000; }
        .total { font-size: 12px; margin-top: 4px; border-top: 1px solid #000; padding-top: 4px; }
        .payment { font-size: 10px; }
        .toolbar { display: none; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sale.shopName)}</h1>
    <div class="meta">
      <div><strong>Receipt:</strong> ${escapeHtml(sale.documentNumber ?? '—')}</div>
      <div><strong>Date:</strong> ${dateStr}</div>
      ${clerkLine}
      ${customerLine}
    </div>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="total">Total: ${formatUgxTotal(sale.totalAmount)}</div>
    <div class="payment">Payment: ${escapeHtml(sale.paymentMethod)}</div>
    <div class="toolbar">
      <button onclick="window.print()">Print</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
