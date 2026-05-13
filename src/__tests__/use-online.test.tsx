// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useOnline } from "#/lib/offline/use-online"

// Stub fetch to avoid real network calls from the heartbeat.
// We return a never-resolving promise so only the window events drive state.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
  // Reset onLine to true before each test
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useOnline", () => {
  it("returns true when navigator.onLine is true on mount", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    })
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })

  it("returns false when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    })
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event("offline"))
    })

    expect(result.current).toBe(false)
  })

  it("returns true when online event fires after going offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    })
    const { result } = renderHook(() => useOnline())

    act(() => {
      window.dispatchEvent(new Event("offline"))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    expect(result.current).toBe(true)
  })
})
