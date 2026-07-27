/**
 * Open a printable Z report in a new window.
 *
 * Mirrors print-receipt.ts: serves the HTML via a Blob URL so the receiving
 * window stays sandboxed. The HTML comes from renderShiftClosure which
 * already escapes interpolated values.
 *
 * Callers must invoke this from a user gesture (button click) — popup
 * blockers reject window.open otherwise.
 */
export function openShiftClosurePrintWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=400,height=640')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error(
      "Couldn't open the Z report window — allow pop-ups for this site and try again.",
    )
  }
  win.addEventListener('load', () => {
    try {
      win.focus()
      win.print()
    } catch {
      // The Z-report template renders its own Print button as a fallback.
    }
    win.addEventListener('beforeunload', () => URL.revokeObjectURL(url))
  })
}
