import BigNumber from "bignumber.js"
import { describe, it, expect } from "vitest"
import {
  roundUgxFloor50,
  roundUgxBankers50,
  formatUgx,
  formatUgxTotal,
} from "#/lib/format"

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

describe("roundUgxBankers50", () => {
  it("rounds non-half values to the nearest multiple of 50", () => {
    expect(roundUgxBankers50("1237").toFixed(0)).toBe("1250")
    expect(roundUgxBankers50("1213").toFixed(0)).toBe("1200")
    expect(roundUgxBankers50("1276").toFixed(0)).toBe("1300")
  })
  it("breaks ties toward the even multiple (banker's)", () => {
    expect(roundUgxBankers50("1225").toFixed(0)).toBe("1200") // 24*50, even
    expect(roundUgxBankers50("1275").toFixed(0)).toBe("1300") // 26*50, even
    expect(roundUgxBankers50("1325").toFixed(0)).toBe("1300") // 26*50, even
    expect(roundUgxBankers50("1375").toFixed(0)).toBe("1400") // 28*50, even
  })
  it("leaves exact multiples of 50 unchanged", () => {
    expect(roundUgxBankers50("1250").toFixed(0)).toBe("1250")
    expect(roundUgxBankers50("0").toFixed(0)).toBe("0")
  })
  it("rounds negatives by the same rule", () => {
    expect(roundUgxBankers50("-1237").toFixed(0)).toBe("-1250")
    expect(roundUgxBankers50("-1225").toFixed(0)).toBe("-1200")
    expect(roundUgxBankers50("-1275").toFixed(0)).toBe("-1300")
  })
})

describe("formatUgx", () => {
  it("floors and formats with comma thousands and ' UGX' suffix", () => {
    expect(formatUgx("1237")).toBe("1,200 UGX")
    expect(formatUgx("1000000")).toBe("1,000,000 UGX")
  })
  it("drops fractional shillings on display", () => {
    expect(formatUgx("1237.99")).toBe("1,200 UGX")
    expect(formatUgx("1250.50")).toBe("1,250 UGX")
  })
  it("formats zero", () => {
    expect(formatUgx("0")).toBe("0 UGX")
    expect(formatUgx("49")).toBe("0 UGX")
  })
  it("formats negatives by flooring abs(x) and reapplying the sign", () => {
    expect(formatUgx("-1237")).toBe("-1,200 UGX")
    expect(formatUgx("-49")).toBe("0 UGX")
  })
})

describe("formatUgxTotal", () => {
  it("uses banker's rounding to nearest 50 with thousand separators", () => {
    expect(formatUgxTotal("1237")).toBe("1,250 UGX")
    expect(formatUgxTotal("1213")).toBe("1,200 UGX")
  })
  it("breaks halves toward the even multiple", () => {
    expect(formatUgxTotal("1225")).toBe("1,200 UGX")
    expect(formatUgxTotal("1275")).toBe("1,300 UGX")
  })
  it("formats negatives", () => {
    expect(formatUgxTotal("-1237")).toBe("-1,250 UGX")
  })
  it("formats zero", () => {
    expect(formatUgxTotal("0")).toBe("0 UGX")
  })
})
