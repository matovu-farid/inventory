import { getSaleReceiptHtml } from "#/server/functions/shop/receipt"

/**
 * Fetch a printable HTML receipt for the given sale and open the
 * browser's print dialog. The receipt template's print CSS targets
 * 80mm thermal printer width; if the operator picks an A4 printer,
 * the on-screen layout falls back to the default body width.
 *
 * The caller is responsible for triggering this from a user gesture
 * (button click) — popup blockers will reject `window.open` otherwise.
 *
 * Uses a Blob URL rather than document.write to avoid XSS pitfalls;
 * the HTML body comes from the server's renderSaleReceipt which already
 * escapes interpolated values.
 */
export async function printSaleReceipt(saleId: string): Promise<void> {
  const html = await getSaleReceiptHtml({ data: { saleId } })
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, "_blank", "width=400,height=640")
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error(
      "Couldn't open the receipt window — allow pop-ups for this site and try again.",
    )
  }
  // Trigger print once the receipt window finishes loading.
  win.addEventListener("load", () => {
    try {
      win.focus()
      win.print()
    } catch {
      // ignore — the receipt template renders its own Print button
    }
    // Release the Blob URL when the window is closed.
    win.addEventListener("beforeunload", () => URL.revokeObjectURL(url))
  })
}
