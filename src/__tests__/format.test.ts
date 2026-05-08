import BigNumber from "bignumber.js"
import { describe, it, expect } from "vitest"
import { roundUgxFloor50 } from "#/lib/format"

describe("roundUgxFloor50", () => {
  it("floors a positive non-multiple down to nearest 50", () => {
    expect(roundUgxFloor50("1237").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1249").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1299").toFixed(0)).toBe("1250")
  })
  it("leaves an exact multiple of 50 unchanged", () => {
    expect(roundUgxFloor50("1250").toFixed(0)).toBe("1250")
    expect(roundUgxFloor50("0").toFixed(0)).toBe("0")
  })
  it("returns zero for values strictly below 50", () => {
    expect(roundUgxFloor50("49").toFixed(0)).toBe("0")
    expect(roundUgxFloor50("1").toFixed(0)).toBe("0")
    expect(roundUgxFloor50("50").toFixed(0)).toBe("50") // boundary
  })
  it("floors abs(x) for negatives, then reapplies the sign", () => {
    expect(roundUgxFloor50("-1237").toFixed(0)).toBe("-1200")
    expect(roundUgxFloor50("-1250").toFixed(0)).toBe("-1250")
    expect(roundUgxFloor50("-49").toFixed(0)).toBe("0")
    expect(roundUgxFloor50("-0").toFixed(0)).toBe("0")
  })
  it("ignores fractional shillings in input", () => {
    expect(roundUgxFloor50("1237.99").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1250.01").toFixed(0)).toBe("1250")
  })
  it("accepts BigNumber input", () => {
    expect(roundUgxFloor50(new BigNumber("1234567")).toFixed(0)).toBe("1234550")
  })
})
