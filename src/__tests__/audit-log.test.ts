import { describe, it, expect } from "vitest"
import { buildAuditEntry } from "#/server/middleware/audit"

describe("buildAuditEntry", () => {
  it("requires actor, action, entityType, entityId", () => {
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "minimum_price.update",
      entityType: "store_stock",
      entityId: "stock-1",
    })
    expect(entry.actorUserId).toBe("user-1")
    expect(entry.action).toBe("minimum_price.update")
    expect(entry.entityType).toBe("store_stock")
    expect(entry.entityId).toBe("stock-1")
  })

  it("stamps createdAt as a Date", () => {
    const before = Date.now()
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "test.action",
      entityType: "x",
      entityId: "y",
    })
    expect(entry.createdAt).toBeInstanceOf(Date)
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it("preserves before/after as objects, defaulting to null", () => {
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "minimum_price.update",
      entityType: "store_stock",
      entityId: "stock-1",
      before: { price: "10000" },
      after: { price: "12000" },
    })
    expect(entry.before).toEqual({ price: "10000" })
    expect(entry.after).toEqual({ price: "12000" })
  })

  it("defaults before/after/metadata to null when omitted", () => {
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "user.login",
      entityType: "user",
      entityId: "user-1",
    })
    expect(entry.before).toBeNull()
    expect(entry.after).toBeNull()
    expect(entry.metadata).toBeNull()
  })

  it("preserves metadata for free-form context", () => {
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "credit_sale.authorize",
      entityType: "shop_sale",
      entityId: "sale-1",
      metadata: { customerId: "cust-1", reason: "trusted" },
    })
    expect(entry.metadata).toEqual({ customerId: "cust-1", reason: "trusted" })
  })

  it("captures optional ipAddress and userAgent", () => {
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "user.login",
      entityType: "user",
      entityId: "user-1",
      ipAddress: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    })
    expect(entry.ipAddress).toBe("203.0.113.5")
    expect(entry.userAgent).toBe("Mozilla/5.0")
  })

  it("rejects empty action", () => {
    expect(() =>
      buildAuditEntry({
        actorUserId: "user-1",
        action: "",
        entityType: "x",
        entityId: "y",
      }),
    ).toThrow(/action/i)
  })

  it("rejects empty actorUserId", () => {
    expect(() =>
      buildAuditEntry({
        actorUserId: "",
        action: "x.y",
        entityType: "x",
        entityId: "y",
      }),
    ).toThrow(/actor/i)
  })
})
