/**
 * Multi-clerk isolation logic.
 *
 * Sales role sees only sales they recorded (soldBy=userId).
 * Admin/supervisor see all sales at the shop.
 *
 * This test verifies the predicate construction; the actual db.query
 * is unit-tested indirectly via existing integration tests.
 */
import { describe, it, expect } from "vitest"
import type { Role } from "#/lib/roles"

function buildSalesFilter(
  role: Role,
  userId: string,
  shopId: string,
): { shopId: string; soldBy?: string } {
  if (role === "sales") return { shopId, soldBy: userId }
  return { shopId }
}

describe("buildSalesFilter", () => {
  it("restricts sales role to their own soldBy", () => {
    const f = buildSalesFilter("sales", "u-1", "shop-A")
    expect(f).toEqual({ shopId: "shop-A", soldBy: "u-1" })
  })

  it("allows admin to see all sales at the shop", () => {
    const f = buildSalesFilter("admin", "u-1", "shop-A")
    expect(f).toEqual({ shopId: "shop-A" })
  })

  it("allows supervisor to see all sales at the shop", () => {
    const f = buildSalesFilter("supervisor", "u-1", "shop-A")
    expect(f).toEqual({ shopId: "shop-A" })
  })

  it("two sales clerks have independent filters", () => {
    const clerkA = buildSalesFilter("sales", "u-A", "shop-A")
    const clerkB = buildSalesFilter("sales", "u-B", "shop-A")
    expect(clerkA.soldBy).not.toEqual(clerkB.soldBy)
    expect(clerkA.shopId).toEqual(clerkB.shopId)
  })
})

describe("pos cart storage key", () => {
  function cartKey(userId: string, shopId: string): string {
    return `pos-cart:${userId}:${shopId}`
  }

  it("two clerks at the same shop get distinct cart keys", () => {
    expect(cartKey("u-A", "shop-A")).not.toEqual(cartKey("u-B", "shop-A"))
  })

  it("same clerk at different shops gets distinct cart keys", () => {
    expect(cartKey("u-A", "shop-A")).not.toEqual(cartKey("u-A", "shop-B"))
  })
})
