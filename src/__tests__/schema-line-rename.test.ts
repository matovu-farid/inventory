import { describe, it, expect } from "vitest"
import * as schema from "#/db/schema"

/**
 * Issue #8 — Phase 2 rename: the `*_items` transaction-line tables
 * are renamed to `*_lines` (spec §5). After the rename the Drizzle
 * schema MUST expose the new `*Lines` symbols and MUST NOT expose
 * the old `*Items` line-table symbols.
 *
 * The FK column on `restockRequisitions` is also renamed:
 *   supply_route_item_id → supply_route_line_id
 *
 * Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md §5, §7.
 */
describe("issue #8 — line table rename", () => {
  it("exports the new *Lines line-table symbols", () => {
    expect(schema).toHaveProperty("supplyRouteLines")
    expect(schema).toHaveProperty("shopSaleLines")
    expect(schema).toHaveProperty("storeTransferLines")
    expect(schema).toHaveProperty("stockTakeLines")
    expect(schema).toHaveProperty("shopReturnLines")
    expect(schema).toHaveProperty("storeReturnLines")
  })

  it("no longer exports the old *Items line-table symbols", () => {
    expect(schema).not.toHaveProperty("supplyRouteItems")
    expect(schema).not.toHaveProperty("shopSaleItems")
    expect(schema).not.toHaveProperty("storeTransferItems")
    expect(schema).not.toHaveProperty("stockTakeItems")
    expect(schema).not.toHaveProperty("shopReturnItems")
    expect(schema).not.toHaveProperty("storeReturnItems")
  })

  it("uses supply_route_line_id on restock_requisitions", () => {
    const cols = Object.keys(schema.restockRequisitions)
    expect(cols).toContain("supplyRouteLineId")
    expect(cols).not.toContain("supplyRouteItemId")
  })

  it("uses supply_route_line_id on store_receivings", () => {
    const cols = Object.keys(schema.storeReceivings)
    expect(cols).toContain("supplyRouteLineId")
    expect(cols).not.toContain("supplyRouteItemId")
  })

  it("uses supply_route_line_id on store_stock", () => {
    const cols = Object.keys(schema.storeStock)
    expect(cols).toContain("supplyRouteLineId")
    expect(cols).not.toContain("supplyRouteItemId")
  })
})
