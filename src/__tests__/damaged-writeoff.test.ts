import { describe, it, expect } from "vitest"
import { computeWriteOffAmount } from "#/server/functions/damaged/writeoff-math"

/**
 * Tests for BUG-2: writeOffDamagedGoods uses the CURRENT
 * shop_stock.costPerUnitUgx for the write-off journal value, but the cost
 * may have changed (e.g., a later transfer at a different price) since the
 * units were marked damaged. The damaged-bucket basis should be tracked
 * separately as `damagedValueUgx` and the write-off amount should be
 * proportional: (damagedValueUgx / damagedQuantity) * writeOffQuantity.
 *
 * The intended pure-helper API:
 *   computeWriteOffAmount({
 *     damagedQuantity, damagedValueUgx, writeOffQuantity
 *   }) -> string  (UGX, fixed(2))
 */

describe("computeWriteOffAmount", () => {
  it("returns the full bucket value when writing off all damaged units", () => {
    const amount = computeWriteOffAmount({
      damagedQuantity: 5,
      damagedValueUgx: "50000",
      writeOffQuantity: 5,
    })
    expect(amount).toBe("50000.00")
  })

  it("returns a proportional amount for a partial write-off (uniform basis)", () => {
    // 5 units valued at 50,000 -> 10,000 each. Writing off 2 -> 20,000.
    const amount = computeWriteOffAmount({
      damagedQuantity: 5,
      damagedValueUgx: "50000",
      writeOffQuantity: 2,
    })
    expect(amount).toBe("20000.00")
  })

  it("uses the bucket's avg cost — NOT the current stock cost — for mixed-cost buckets", () => {
    // Bucket: 5 units @ 10,000 + 3 units @ 12,000 = 50,000 + 36,000 = 86,000
    // Total damaged: 8 units, total value: 86,000
    // Write off 4 units -> (86,000 / 8) * 4 = 43,000
    const amount = computeWriteOffAmount({
      damagedQuantity: 8,
      damagedValueUgx: "86000",
      writeOffQuantity: 4,
    })
    expect(amount).toBe("43000.00")
  })

  it("preserves cents precision for non-integer per-unit basis", () => {
    // 3 units worth 100.00 -> 33.333... per unit. Write off 2 -> 66.67
    const amount = computeWriteOffAmount({
      damagedQuantity: 3,
      damagedValueUgx: "100",
      writeOffQuantity: 2,
    })
    // Allow either banker's rounding result; we expect HALF_UP.
    expect(amount).toBe("66.67")
  })

  it("rejects write-off quantity greater than damaged quantity", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: 5,
        damagedValueUgx: "50000",
        writeOffQuantity: 6,
      }),
    ).toThrow(/(damaged|exceed|too many|enough)/i)
  })

  it("rejects zero write-off quantity", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: 5,
        damagedValueUgx: "50000",
        writeOffQuantity: 0,
      }),
    ).toThrow(/positive/i)
  })

  it("rejects negative write-off quantity", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: 5,
        damagedValueUgx: "50000",
        writeOffQuantity: -1,
      }),
    ).toThrow(/positive/i)
  })

  it("rejects negative damaged quantity", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: -1,
        damagedValueUgx: "0",
        writeOffQuantity: 1,
      }),
    ).toThrow(/(positive|negative)/i)
  })

  it("rejects negative damaged value", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: 5,
        damagedValueUgx: "-100",
        writeOffQuantity: 1,
      }),
    ).toThrow(/(positive|negative)/i)
  })

  it("rejects write-off when there are no damaged units", () => {
    expect(() =>
      computeWriteOffAmount({
        damagedQuantity: 0,
        damagedValueUgx: "0",
        writeOffQuantity: 1,
      }),
    ).toThrow(/(damaged|empty|none)/i)
  })
})
