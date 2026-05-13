// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches,
    media: q,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
  return {
    setMatches(next: boolean) {
      listeners.forEach((l) => l({ matches: next }))
    },
  }
}

describe("useIsMobile", () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it("returns false when viewport is wider than 768px", () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it("returns true when viewport matches mobile", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it("updates when the media query changes", () => {
    const m = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => m.setMatches(true))
    expect(result.current).toBe(true)
  })
})
