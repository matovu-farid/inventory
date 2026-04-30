import { describe, it, expect } from "vitest"
import {
  shouldNotifyLowStock,
  shouldNotifyDiscrepancy,
  shouldNotifyOverdueCredit
  
} from "#/lib/notifications/thresholds"
import type {Thresholds} from "#/lib/notifications/thresholds";

const defaults: Thresholds = {
  lowStockUnits: 5,
  discrepancyPercent: 10,
  overdueDays: 30,
}

describe("shouldNotifyLowStock", () => {
  it("returns true when on-hand <= threshold", () => {
    expect(shouldNotifyLowStock(5, defaults)).toBe(true)
    expect(shouldNotifyLowStock(0, defaults)).toBe(true)
  })
  it("returns false when on-hand above threshold", () => {
    expect(shouldNotifyLowStock(6, defaults)).toBe(false)
    expect(shouldNotifyLowStock(100, defaults)).toBe(false)
  })
  it("respects custom threshold", () => {
    expect(shouldNotifyLowStock(11, { ...defaults, lowStockUnits: 10 })).toBe(false)
    expect(shouldNotifyLowStock(10, { ...defaults, lowStockUnits: 10 })).toBe(true)
  })
})

describe("shouldNotifyDiscrepancy", () => {
  it("returns true when |discrepancy| / system >= threshold percent", () => {
    expect(shouldNotifyDiscrepancy(100, 10, defaults)).toBe(true) // 10%
    expect(shouldNotifyDiscrepancy(100, 11, defaults)).toBe(true)
    expect(shouldNotifyDiscrepancy(100, -15, defaults)).toBe(true)
  })
  it("returns false when discrepancy is below threshold percent", () => {
    expect(shouldNotifyDiscrepancy(100, 9, defaults)).toBe(false)
    expect(shouldNotifyDiscrepancy(100, 0, defaults)).toBe(false)
  })
  it("returns false when system quantity is zero (avoid divide-by-zero spam)", () => {
    expect(shouldNotifyDiscrepancy(0, 5, defaults)).toBe(false)
  })
})

describe("shouldNotifyOverdueCredit", () => {
  it("returns true when sale is older than threshold and unsettled", () => {
    const now = new Date("2026-05-01")
    const saleDate = new Date("2026-03-01") // 61 days
    expect(shouldNotifyOverdueCredit(saleDate, "open", now, defaults)).toBe(true)
  })
  it("returns true even for partially_paid if older than threshold", () => {
    const now = new Date("2026-05-01")
    const saleDate = new Date("2026-03-01")
    expect(
      shouldNotifyOverdueCredit(saleDate, "partially_paid", now, defaults),
    ).toBe(true)
  })
  it("returns false for settled or written_off statuses", () => {
    const now = new Date("2026-05-01")
    const saleDate = new Date("2026-01-01")
    expect(shouldNotifyOverdueCredit(saleDate, "settled", now, defaults)).toBe(false)
    expect(
      shouldNotifyOverdueCredit(saleDate, "written_off", now, defaults),
    ).toBe(false)
  })
  it("returns false when sale is younger than threshold", () => {
    const now = new Date("2026-05-01")
    const saleDate = new Date("2026-04-15") // 16 days
    expect(shouldNotifyOverdueCredit(saleDate, "open", now, defaults)).toBe(false)
  })
})
