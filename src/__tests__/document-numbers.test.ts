import { describe, it, expect } from "vitest"
import { formatDocumentNumber } from "#/lib/document-numbers"

describe("formatDocumentNumber", () => {
  it("formats with prefix, year, and zero-padded number", () => {
    expect(formatDocumentNumber("SALE", 2026, 1, 5)).toBe("SALE-2026-00001")
  })

  it("uses default padding of 4 when not specified", () => {
    expect(formatDocumentNumber("SR", 2026, 48)).toBe("SR-2026-0048")
  })

  it("does not truncate numbers longer than the pad", () => {
    expect(formatDocumentNumber("SALE", 2026, 99999, 4)).toBe("SALE-2026-99999")
  })

  it("supports compound prefixes like STR-RET", () => {
    expect(formatDocumentNumber("STR-RET", 2026, 3)).toBe("STR-RET-2026-0003")
  })

  it("rejects empty prefix", () => {
    expect(() => formatDocumentNumber("", 2026, 1)).toThrow(/prefix/i)
  })

  it("rejects non-positive year", () => {
    expect(() => formatDocumentNumber("SR", 0, 1)).toThrow(/year/i)
    expect(() => formatDocumentNumber("SR", -1, 1)).toThrow(/year/i)
  })

  it("rejects non-positive number", () => {
    expect(() => formatDocumentNumber("SR", 2026, 0)).toThrow(/number/i)
    expect(() => formatDocumentNumber("SR", 2026, -1)).toThrow(/number/i)
  })

  it("rejects non-integer number", () => {
    expect(() => formatDocumentNumber("SR", 2026, 1.5)).toThrow(/integer/i)
  })
})
