import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { validateCreditAdjustmentRefund } from "#/server/functions/shop/refund-validate"

/**
 * Tests for GAP-5: in credit_adjustment refunds the ledger credits the full
 * totalRefund to A/R while the balance update clamps to max(balance - refund, 0).
 * When totalRefund > outstandingBalance, the ledger is over-credited and the
 * customer's account ends up with a phantom positive balance.
 *
 * Intended pure-helper API:
 *   validateCreditAdjustmentRefund({ totalRefund, outstandingBalance })
 *     - Throws when totalRefund > outstandingBalance, with both numbers in the message
 *     - Returns void on valid input
 *     - totalRefund == outstandingBalance is allowed (boundary)
 */

describe("validateCreditAdjustmentRefund — examples (GAP-5)", () => {
  it("throws when refund exceeds outstanding balance", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "5000",
        outstandingBalance: "3000",
      }),
    ).toThrow(/(refund|exceed|balance)/i)
  })

  it("includes both numbers in the error message", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "5000",
        outstandingBalance: "3000",
      }),
    ).toThrow(/5,000/)
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "5000",
        outstandingBalance: "3000",
      }),
    ).toThrow(/3,000/)
  })

  it("allows refund equal to outstanding balance", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "3000",
        outstandingBalance: "3000",
      }),
    ).not.toThrow()
  })

  it("allows refund less than outstanding balance", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "1000",
        outstandingBalance: "3000",
      }),
    ).not.toThrow()
  })

  it("allows zero refund", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "0",
        outstandingBalance: "3000",
      }),
    ).not.toThrow()
  })

  it("allows zero refund against zero balance", () => {
    expect(() =>
      validateCreditAdjustmentRefund({
        totalRefund: "0",
        outstandingBalance: "0",
      }),
    ).not.toThrow()
  })
})

describe("validateCreditAdjustmentRefund — property (GAP-5)", () => {
  it("forAll non-negative integer refund and balance: throws iff refund > balance", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (refund, balance) => {
          const call = () =>
            validateCreditAdjustmentRefund({
              totalRefund: String(refund),
              outstandingBalance: String(balance),
            })
          if (refund > balance) {
            expect(call).toThrow()
          } else {
            expect(call).not.toThrow()
          }
        },
      ),
    )
  })
})
