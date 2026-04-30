import { describe, it, expect } from "vitest"
import { buildReversalEntries  } from "#/lib/accounting/reversal"
import type {OriginalEntry} from "#/lib/accounting/reversal";

const original: OriginalEntry[] = [
  {
    type: "debit",
    amount: "10000",
    categoryId: "cat-cash",
    locationType: "shop",
    locationId: "shop-1",
    bankAccountId: null,
    depositLocation: "cash",
    referenceType: "shop_sale",
    referenceId: "sale-1",
    description: "Sale to customer",
  },
  {
    type: "credit",
    amount: "10000",
    categoryId: "cat-revenue",
    locationType: "shop",
    locationId: "shop-1",
    bankAccountId: null,
    depositLocation: "cash",
    referenceType: "shop_sale",
    referenceId: "sale-1",
    description: "Sale to customer",
  },
]

describe("buildReversalEntries", () => {
  it("flips each leg's debit/credit type", () => {
    const reversal = buildReversalEntries(original, {
      reason: "data entry error",
      recordedBy: "user-admin",
    })
    expect(reversal).toHaveLength(2)
    expect(reversal[0].type).toBe("credit")
    expect(reversal[1].type).toBe("debit")
  })

  it("preserves amount, category, and location on each leg", () => {
    const reversal = buildReversalEntries(original, {
      reason: "x",
      recordedBy: "user-admin",
    })
    expect(reversal[0].amount).toBe("10000")
    expect(reversal[0].categoryId).toBe("cat-cash")
    expect(reversal[0].locationType).toBe("shop")
    expect(reversal[0].locationId).toBe("shop-1")
    expect(reversal[1].categoryId).toBe("cat-revenue")
  })

  it("marks each reversal leg with referenceType=reversal", () => {
    const reversal = buildReversalEntries(original, {
      reason: "x",
      recordedBy: "user-admin",
    })
    expect(reversal.every((e) => e.referenceType === "reversal")).toBe(true)
  })

  it("includes the reason in the description and prefixes 'Reversal:'", () => {
    const reversal = buildReversalEntries(original, {
      reason: "data entry error",
      recordedBy: "user-admin",
    })
    expect(reversal[0].description).toBe("Reversal: data entry error")
  })

  it("attributes the reversal to the recording user", () => {
    const reversal = buildReversalEntries(original, {
      reason: "x",
      recordedBy: "user-admin",
    })
    expect(reversal[0].recordedBy).toBe("user-admin")
  })

  it("rejects an empty reason", () => {
    expect(() =>
      buildReversalEntries(original, { reason: "", recordedBy: "user-admin" }),
    ).toThrow(/reason/i)
  })

  it("rejects an empty recordedBy", () => {
    expect(() =>
      buildReversalEntries(original, { reason: "x", recordedBy: "" }),
    ).toThrow(/recordedBy/i)
  })

  it("rejects an empty original entry list", () => {
    expect(() =>
      buildReversalEntries([], { reason: "x", recordedBy: "user-admin" }),
    ).toThrow(/empty/i)
  })

  it("preserves balance: total debits in reversal equal total credits in original", () => {
    const reversal = buildReversalEntries(original, {
      reason: "x",
      recordedBy: "user-admin",
    })
    const reversalDebits = reversal
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + Number(e.amount), 0)
    const originalCredits = original
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + Number(e.amount), 0)
    expect(reversalDebits).toBe(originalCredits)
  })
})
