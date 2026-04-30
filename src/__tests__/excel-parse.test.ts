import { describe, it, expect } from "vitest"
import {
  parseExcelRouteSheet,
  computeExternalRef
  
} from "#/lib/excel/parser"
import type {RawRow} from "#/lib/excel/parser";

describe("parseExcelRouteSheet", () => {
  it("extracts route items from rows with the expected columns", () => {
    const rows: RawRow[] = [
      {
        DATE: "2026-01-15",
        DETAILS: "Trousers",
        "ART NO": "TR-001",
        "EX.RATE": 7.2,
        QTY: 100,
        "RATE(rmb)": 50,
        "AMOUNT(rmb)": 5000,
        "USD($)": 694.44,
        "USD RATE(Shs)": 3700,
        "T.COST(shs)": 2569428,
      },
      {
        DATE: "2026-01-15",
        DETAILS: "Shirts",
        "ART NO": "SH-002",
        "EX.RATE": 7.2,
        QTY: 50,
        "RATE(rmb)": 30,
        "AMOUNT(rmb)": 1500,
        "USD($)": 208.33,
        "USD RATE(Shs)": 3700,
        "T.COST(shs)": 770821,
      },
    ]
    const result = parseExcelRouteSheet("46th Route", rows)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      productName: "Trousers",
      articleNumber: "TR-001",
      quantity: 100,
      unitPriceForeign: "50",
      foreignCurrency: "RMB",
    })
  })

  it("ignores blank rows", () => {
    const rows: RawRow[] = [
      { DETAILS: "Trousers", QTY: 100, "RATE(rmb)": 50 },
      { DETAILS: "", QTY: 0 },
      { DETAILS: "Shirts", QTY: 50, "RATE(rmb)": 30 },
    ]
    const result = parseExcelRouteSheet("R", rows)
    expect(result.items).toHaveLength(2)
  })

  it("preserves the route name", () => {
    const result = parseExcelRouteSheet("46th Route", [])
    expect(result.name).toBe("46th Route")
  })

  it("rejects rows missing required fields", () => {
    const rows: RawRow[] = [
      { DETAILS: "Trousers" }, // missing QTY and RATE
    ]
    expect(() => parseExcelRouteSheet("X", rows)).toThrow(/required/i)
  })

  it("collects exchange rates per item", () => {
    const rows: RawRow[] = [
      {
        DETAILS: "Trousers",
        QTY: 1,
        "RATE(rmb)": 50,
        "EX.RATE": 7.2,
        "USD RATE(Shs)": 3700,
      },
    ]
    const result = parseExcelRouteSheet("X", rows)
    expect(result.items[0].exchangeRateForeignToUsd).toBe("7.2")
    expect(result.items[0].exchangeRateUsdToUgx).toBe("3700")
  })
})

describe("computeExternalRef", () => {
  it("returns a stable hex string for given filename + sheet", () => {
    const a = computeExternalRef("gross_profit.xlsx", "46th Route")
    const b = computeExternalRef("gross_profit.xlsx", "46th Route")
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{16,}$/)
  })

  it("differs between sheets", () => {
    expect(computeExternalRef("g.xlsx", "A")).not.toBe(
      computeExternalRef("g.xlsx", "B"),
    )
  })

  it("differs between filenames", () => {
    expect(computeExternalRef("a.xlsx", "X")).not.toBe(
      computeExternalRef("b.xlsx", "X"),
    )
  })
})
