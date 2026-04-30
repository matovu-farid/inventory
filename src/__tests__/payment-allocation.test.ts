import { describe, it, expect } from "vitest"
import {
  allocatePaymentFifo
  
  
} from "#/lib/credit/payment-allocation"
import type {OpenSale, Allocation} from "#/lib/credit/payment-allocation";

const sale = (
  id: string,
  outstandingBalance: string,
  saleDate: string,
): OpenSale => ({ id, outstandingBalance, saleDate: new Date(saleDate) })

describe("allocatePaymentFifo", () => {
  it("allocates the entire payment to the oldest sale when payment <= balance", () => {
    const sales = [sale("a", "10000", "2026-01-01"), sale("b", "5000", "2026-02-01")]
    const result = allocatePaymentFifo(sales, "3000")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "a", amountApplied: "3000.00" },
    ])
    expect(result.unallocated).toBe("0.00")
  })

  it("walks across multiple sales when payment exceeds first balance", () => {
    const sales = [sale("a", "10000", "2026-01-01"), sale("b", "5000", "2026-02-01")]
    const result = allocatePaymentFifo(sales, "12000")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "a", amountApplied: "10000.00" },
      { shopSaleId: "b", amountApplied: "2000.00" },
    ])
    expect(result.unallocated).toBe("0.00")
  })

  it("orders by saleDate ascending regardless of input order", () => {
    const sales = [sale("b", "5000", "2026-02-01"), sale("a", "10000", "2026-01-01")]
    const result = allocatePaymentFifo(sales, "12000")
    expect(result.allocations[0].shopSaleId).toBe("a")
    expect(result.allocations[1].shopSaleId).toBe("b")
  })

  it("settles a sale exactly when allocation matches balance", () => {
    const sales = [sale("a", "10000", "2026-01-01")]
    const result = allocatePaymentFifo(sales, "10000")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "a", amountApplied: "10000.00" },
    ])
    expect(result.unallocated).toBe("0.00")
  })

  it("reports unallocated remainder when payment exceeds total open balance", () => {
    const sales = [sale("a", "10000", "2026-01-01")]
    const result = allocatePaymentFifo(sales, "12000")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "a", amountApplied: "10000.00" },
    ])
    expect(result.unallocated).toBe("2000.00")
  })

  it("returns no allocations when there are no open sales", () => {
    const result = allocatePaymentFifo([], "5000")
    expect(result.allocations).toEqual([])
    expect(result.unallocated).toBe("5000.00")
  })

  it("rejects zero or negative payment amounts", () => {
    expect(() => allocatePaymentFifo([], "0")).toThrow(/positive/i)
    expect(() => allocatePaymentFifo([], "-100")).toThrow(/positive/i)
  })

  it("preserves cents precision across multiple allocations", () => {
    const sales = [
      sale("a", "100.50", "2026-01-01"),
      sale("b", "200.75", "2026-02-01"),
    ]
    const result = allocatePaymentFifo(sales, "250.00")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "a", amountApplied: "100.50" },
      { shopSaleId: "b", amountApplied: "149.50" },
    ])
    expect(result.unallocated).toBe("0.00")
  })

  it("skips sales with zero outstanding balance", () => {
    const sales = [
      sale("a", "0", "2026-01-01"),
      sale("b", "5000", "2026-02-01"),
    ]
    const result = allocatePaymentFifo(sales, "3000")
    expect(result.allocations).toEqual<Allocation[]>([
      { shopSaleId: "b", amountApplied: "3000.00" },
    ])
  })
})

describe("computeNewSaleStatus", () => {
  it("returns 'settled' when balance hits zero", async () => {
    const { computeNewSaleStatus } = await import("#/lib/credit/payment-allocation")
    expect(computeNewSaleStatus("0")).toBe("settled")
  })

  it("returns 'partially_paid' when balance is above zero but below original total", async () => {
    const { computeNewSaleStatus } = await import("#/lib/credit/payment-allocation")
    expect(computeNewSaleStatus("100.50")).toBe("partially_paid")
  })

  it("rejects negative balances", async () => {
    const { computeNewSaleStatus } = await import("#/lib/credit/payment-allocation")
    expect(() => computeNewSaleStatus("-1")).toThrow(/negative/i)
  })
})
