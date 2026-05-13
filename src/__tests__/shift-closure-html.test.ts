/**
 * Shift closure HTML renderer.
 *
 * Verifies the template embeds critical fields and applies HTML escaping.
 * Print-layout (80mm thermal) is validated manually in a real browser.
 */
import { describe, it, expect } from "vitest"
import { renderShiftClosure } from "#/lib/pdf/shift-closure-html"

const baseClosure = {
  closureNumber: 7,
  shopName: "Kampala Main",
  closedByName: "Aisha",
  periodStart: new Date("2026-05-13T06:00:00Z"),
  closedAt: new Date("2026-05-13T19:00:00Z"),
  grossSalesUgx: "1450000",
  cashSalesUgx: "900000",
  bankSalesUgx: "400000",
  creditSalesUgx: "150000",
  declaredCashUgx: "895000",
  expectedCashUgx: "900000",
  varianceUgx: "-5000",
  salesCount: 23,
  byClerk: [
    { userId: "u1", userName: "Aisha", totalUgx: "1000000", count: 15 },
    { userId: "u2", userName: "Brian", totalUgx: "450000", count: 8 },
  ],
}

describe("renderShiftClosure", () => {
  it("includes the closure number, shop and totals", () => {
    const html = renderShiftClosure(baseClosure)
    expect(html).toContain("Z #7")
    expect(html).toContain("Kampala Main")
    expect(html).toContain("Aisha")
    expect(html).toContain("1,450,000")
  })

  it("renders negative variance with sign", () => {
    const html = renderShiftClosure(baseClosure)
    expect(html).toContain("-5,000")
  })

  it("escapes user-supplied shop names", () => {
    const html = renderShiftClosure({
      ...baseClosure,
      shopName: "<script>alert(1)</script>",
    })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("falls back to userId when userName is missing", () => {
    const html = renderShiftClosure({
      ...baseClosure,
      byClerk: [{ userId: "u-fallback", userName: null, totalUgx: "1000", count: 1 }],
    })
    expect(html).toContain("u-fallback")
  })

  it("handles empty byClerk list without crashing", () => {
    const html = renderShiftClosure({ ...baseClosure, byClerk: [] })
    expect(html).toContain("Z #7")
  })
})
