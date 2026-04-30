import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { validateReceiveItem } from "#/server/functions/store/receive-validate"

/**
 * Tests for BUG-1: receiveGoods computes
 *   usableQty = item.quantityReceived - item.quantityDamaged
 * and silently allows it to go negative when quantityDamaged > quantityReceived.
 * A negative usableQty later corrupts storeStock.quantityOnHand.
 *
 * Intended pure-helper API:
 *   validateReceiveItem({ quantityReceived, quantityDamaged })
 *     - throws when quantityDamaged > quantityReceived
 *     - throws when either input is negative
 *     - returns { usableQty } when valid (usableQty >= 0)
 */

describe("validateReceiveItem — guard (BUG-1)", () => {
  it("throws when damaged > received", () => {
    expect(() =>
      validateReceiveItem({ quantityReceived: 5, quantityDamaged: 7 }),
    ).toThrow(/damaged|received|exceed/i)
  })

  it("throws when damaged is negative", () => {
    expect(() =>
      validateReceiveItem({ quantityReceived: 5, quantityDamaged: -1 }),
    ).toThrow(/(negative|positive)/i)
  })

  it("throws when received is negative", () => {
    expect(() =>
      validateReceiveItem({ quantityReceived: -1, quantityDamaged: 0 }),
    ).toThrow(/(negative|positive)/i)
  })

  it("returns usableQty = received - damaged for valid input", () => {
    expect(validateReceiveItem({ quantityReceived: 10, quantityDamaged: 3 })).toEqual({
      usableQty: 7,
    })
  })

  it("allows damaged == received (usableQty = 0)", () => {
    expect(validateReceiveItem({ quantityReceived: 4, quantityDamaged: 4 })).toEqual({
      usableQty: 0,
    })
  })

  it("allows zero received and zero damaged (usableQty = 0)", () => {
    expect(validateReceiveItem({ quantityReceived: 0, quantityDamaged: 0 })).toEqual({
      usableQty: 0,
    })
  })
})

describe("validateReceiveItem — property (BUG-1)", () => {
  it("forAll non-negative integer received, damaged: throws iff damaged > received", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (received, damaged) => {
          if (damaged > received) {
            expect(() =>
              validateReceiveItem({
                quantityReceived: received,
                quantityDamaged: damaged,
              }),
            ).toThrow()
          } else {
            const result = validateReceiveItem({
              quantityReceived: received,
              quantityDamaged: damaged,
            })
            expect(result.usableQty).toBe(received - damaged)
            expect(result.usableQty).toBeGreaterThanOrEqual(0)
          }
        },
      ),
    )
  })
})
