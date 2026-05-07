import { describe, it, expect } from "vitest"
import { filterRoutesWithUnreceivedItems } from "#/server/functions/store/receiving"

describe("filterRoutesWithUnreceivedItems", () => {
  it("excludes a route whose every item has been received (the China Trip bug)", () => {
    const routes = [
      {
        id: "route-china",
        status: "received" as const,
        items: [{ id: "item-a" }, { id: "item-b" }],
      },
    ]
    const receivedItemIds = new Set(["item-a", "item-b"])
    expect(filterRoutesWithUnreceivedItems(routes, receivedItemIds)).toEqual([])
  })

  it("includes a route with at least one unreceived item", () => {
    const routes = [
      {
        id: "route-mixed",
        status: "in_transit" as const,
        items: [{ id: "item-a" }, { id: "item-b" }],
      },
    ]
    const receivedItemIds = new Set(["item-a"])
    const result = filterRoutesWithUnreceivedItems(routes, receivedItemIds)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe("route-mixed")
  })

  it("includes a route whose items are all unreceived", () => {
    const routes = [
      {
        id: "route-fresh",
        status: "in_transit" as const,
        items: [{ id: "item-x" }],
      },
    ]
    expect(
      filterRoutesWithUnreceivedItems(routes, new Set<string>()),
    ).toHaveLength(1)
  })

  it("excludes a route with zero items (nothing to receive)", () => {
    const routes = [
      {
        id: "route-empty",
        status: "in_transit" as const,
        items: [],
      },
    ]
    expect(filterRoutesWithUnreceivedItems(routes, new Set())).toEqual([])
  })
})
