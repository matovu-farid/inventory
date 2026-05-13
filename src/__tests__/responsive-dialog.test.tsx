// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from "#/components/ui/responsive-dialog"

afterEach(cleanup)

function setMatches(matches: boolean) {
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
}

describe("ResponsiveDialog", () => {
  beforeEach(() => setMatches(false))

  it("renders dialog content on desktop", () => {
    setMatches(false)
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Hello</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <p>Body content</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    expect(screen.getByText("Hello")).toBeTruthy()
    expect(screen.getByText("Body content")).toBeTruthy()
  })

  it("renders sheet content on mobile", () => {
    setMatches(true)
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Hello mobile</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <p>Body content</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    expect(screen.getByText("Hello mobile")).toBeTruthy()
  })
})
