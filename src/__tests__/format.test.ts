import { describe, it, expect } from "vitest"
import { formatUgx } from "#/lib/format"

describe("formatUgx", () => {
  it("formats whole numbers with comma thousands and 'UGX' suffix", () => {
    expect(formatUgx("1000")).toBe("1,000 UGX")
    expect(formatUgx("1000000")).toBe("1,000,000 UGX")
  })

  it("strips trailing .00 for whole-shilling amounts", () => {
    expect(formatUgx("1000.00")).toBe("1,000 UGX")
  })

  it("preserves cents when non-zero", () => {
    expect(formatUgx("1000.50")).toBe("1,000.50 UGX")
  })

  it("handles zero", () => {
    expect(formatUgx("0")).toBe("0 UGX")
  })

  it("handles negative amounts", () => {
    expect(formatUgx("-500")).toBe("-500 UGX")
  })

  it("accepts BigNumber-string input including very large numbers", () => {
    expect(formatUgx("1234567890.12")).toBe("1,234,567,890.12 UGX")
  })
})
