// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import "fake-indexeddb/auto"
import {
  putQueuedSale,
  getQueuedSales,
  deleteQueuedSale,
  updateQueuedSaleStatus,
  clearAllQueuedSales
  
} from "#/lib/offline/idb"
import type {QueuedSale} from "#/lib/offline/idb";

function makeSale(overrides: Partial<QueuedSale> = {}): QueuedSale {
  return {
    id: crypto.randomUUID(),
    shopId: "shop-1",
    createdAt: Date.now(),
    payload: { shopId: "shop-1", items: [] },
    status: "queued",
    failureReason: null,
    attemptCount: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await clearAllQueuedSales()
})

describe("IDB offline queue", () => {
  it("put + get round-trip", async () => {
    const sale = makeSale()
    await putQueuedSale(sale)
    const all = await getQueuedSales()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(sale.id)
    expect(all[0].shopId).toBe("shop-1")
  })

  it("stores multiple sales independently", async () => {
    const a = makeSale({ shopId: "shop-a" })
    const b = makeSale({ shopId: "shop-b" })
    await putQueuedSale(a)
    await putQueuedSale(b)
    const all = await getQueuedSales()
    expect(all).toHaveLength(2)
  })

  it("filters queued sales via application-level filter", async () => {
    const q = makeSale({ status: "queued" })
    const f = makeSale({ status: "failed" })
    await putQueuedSale(q)
    await putQueuedSale(f)
    const all = await getQueuedSales()
    const queued = all.filter((s) => s.status === "queued")
    const failed = all.filter((s) => s.status === "failed")
    expect(queued).toHaveLength(1)
    expect(failed).toHaveLength(1)
  })

  it("updateQueuedSaleStatus changes one entry without affecting others", async () => {
    const a = makeSale()
    const b = makeSale()
    await putQueuedSale(a)
    await putQueuedSale(b)

    await updateQueuedSaleStatus(a.id, "failed", "Out of stock")

    const all = await getQueuedSales()
    const updated = all.find((s) => s.id === a.id)
    const untouched = all.find((s) => s.id === b.id)
    if (!updated || !untouched) throw new Error("expected both queued sales to be present")

    expect(updated.status).toBe("failed")
    expect(updated.failureReason).toBe("Out of stock")
    expect(updated.attemptCount).toBe(1)

    expect(untouched.status).toBe("queued")
    expect(untouched.failureReason).toBeNull()
    expect(untouched.attemptCount).toBe(0)
  })

  it("delete removes entry", async () => {
    const sale = makeSale()
    await putQueuedSale(sale)
    await deleteQueuedSale(sale.id)
    const all = await getQueuedSales()
    expect(all.find((s) => s.id === sale.id)).toBeUndefined()
  })

  it("delete of non-existent id is a no-op", async () => {
    const sale = makeSale()
    await putQueuedSale(sale)
    await deleteQueuedSale("non-existent-id")
    const all = await getQueuedSales()
    expect(all).toHaveLength(1)
  })

  it("loads 50+ sales in reasonable time", async () => {
    const N = 60
    for (let i = 0; i < N; i++) {
      await putQueuedSale(makeSale({ createdAt: Date.now() + i }))
    }
    const start = Date.now()
    const all = await getQueuedSales()
    const elapsed = Date.now() - start
    expect(all).toHaveLength(N)
    expect(elapsed).toBeLessThan(2_000)
  })

  it("clearAllQueuedSales empties the store", async () => {
    await putQueuedSale(makeSale())
    await putQueuedSale(makeSale())
    await clearAllQueuedSales()
    const all = await getQueuedSales()
    expect(all).toHaveLength(0)
  })
})
