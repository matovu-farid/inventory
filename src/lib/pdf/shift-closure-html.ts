import { formatUgx } from "#/lib/format"

interface ClerkRow {
  userId: string
  userName: string | null
  totalUgx: string
  count: number
}

interface ShiftClosureForPrint {
  closureNumber: number
  shopName: string
  closedByName: string | null
  periodStart: Date
  closedAt: Date
  grossSalesUgx: string
  cashSalesUgx: string
  bankSalesUgx: string
  creditSalesUgx: string
  declaredCashUgx: string
  expectedCashUgx: string
  varianceUgx: string
  salesCount: number
  byClerk: ClerkRow[]
}

/**
 * Render a printable HTML Z-report. Layout mirrors receipt-html.ts:
 * A4-friendly on screen, 80mm thermal under @media print.
 */
export function renderShiftClosure(c: ShiftClosureForPrint): string {
  const fmt = (d: Date) =>
    d.toLocaleString("en-UG", { timeZone: "Africa/Kampala" })
  const clerkRows = c.byClerk
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.userName ?? r.userId)}</td>
          <td class="num">${r.count}</td>
          <td class="num">${formatUgx(r.totalUgx)}</td>
        </tr>`,
    )
    .join("")

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Z #${c.closureNumber}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 24px; color: #111; max-width: 720px; }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
      th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .toolbar { margin-top: 24px; display: flex; gap: 8px; }
      .toolbar button { padding: 8px 14px; cursor: pointer; }

      @media print {
        @page { size: 80mm auto; margin: 0; }
        body {
          margin: 0; padding: 4mm; width: 72mm;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px; color: #000;
        }
        h1 { font-size: 13px; margin: 0 0 4px 0; text-align: center; }
        .meta { margin-bottom: 6px; font-size: 10px; }
        table { font-size: 10px; }
        th, td { padding: 2px 0; border: 0; border-bottom: 1px dashed #888; }
        thead tr { border-bottom: 1px solid #000; }
        .toolbar { display: none; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(c.shopName)} — Z #${c.closureNumber}</h1>
    <div class="meta">
      <div><strong>Period:</strong> ${fmt(c.periodStart)} → ${fmt(c.closedAt)}</div>
      <div><strong>Closed by:</strong> ${escapeHtml(c.closedByName ?? "—")}</div>
      <div><strong>Sales count:</strong> ${c.salesCount}</div>
    </div>

    <table>
      <thead><tr><th>By method</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>Cash</td><td class="num">${formatUgx(c.cashSalesUgx)}</td></tr>
        <tr><td>Bank</td><td class="num">${formatUgx(c.bankSalesUgx)}</td></tr>
        <tr><td>Credit</td><td class="num">${formatUgx(c.creditSalesUgx)}</td></tr>
        <tr><td><strong>Gross</strong></td><td class="num"><strong>${formatUgx(c.grossSalesUgx)}</strong></td></tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>Cash drawer</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>Expected</td><td class="num">${formatUgx(c.expectedCashUgx)}</td></tr>
        <tr><td>Declared</td><td class="num">${formatUgx(c.declaredCashUgx)}</td></tr>
        <tr><td><strong>Variance</strong></td><td class="num"><strong>${formatUgx(c.varianceUgx)}</strong></td></tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>Clerk</th><th class="num">Sales</th><th class="num">Total</th></tr></thead>
      <tbody>${clerkRows}</tbody>
    </table>

    <div class="toolbar">
      <button onclick="window.print()">Print</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body>
</html>`
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c)
}
