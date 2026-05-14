import type { MissingPrereq, PrerequisiteResult } from "./types"
import { SATISFIED } from "./types"

// ---------- shared prereq builders ------------------------------------------

const noShopsPrereq: MissingPrereq = Object.freeze({
  id: "no-shops",
  severity: "hard",
  title: "No shops configured",
  why: "Create at least one shop before you can use this page.",
  actions: Object.freeze([{ label: "Go to Shop", href: "/shop" }] as const),
})

const noStoreStockPrereq: MissingPrereq = Object.freeze({
  id: "no-store-stock",
  severity: "hard",
  title: "Warehouse has no stock",
  why: "Receive goods from a supply route or set a warehouse opening balance first.",
  actions: Object.freeze([
    { label: "Receive Goods", href: "/store/receiving" },
    { label: "Set Opening Balance", href: "/store/opening-balance" },
  ] as const),
})

const noSuppliersPrereq: MissingPrereq = Object.freeze({
  id: "no-suppliers",
  severity: "soft",
  title: "No suppliers yet",
  why: "You'll need at least one supplier before you can add items to a route.",
  actions: Object.freeze([{ label: "Go to Suppliers", href: "/supply/suppliers" }] as const),
})

// ---------- per-page derive functions ---------------------------------------

export interface ReceivingPrereqInput {
  /** Count of supply routes in in_transit/received status with ≥1 unreceived item. */
  receivableRouteCount: number
}

export function deriveReceivingPrereqs(
  input: ReceivingPrereqInput,
): PrerequisiteResult {
  if (input.receivableRouteCount > 0) return SATISFIED
  return {
    satisfied: true,
    missing: [
      {
        id: "no-receivable-routes",
        severity: "soft",
        title: "No supply routes ready to receive",
        why: "Nothing is in transit right now. When you mark a supply route 'in transit' or 'received', it will show up here for receiving.",
        actions: [{ label: "Go to Supply Routes", href: "/supply" }],
      },
    ],
  }
}

export interface TransfersPrereqInput {
  shopCount: number
  /** Number of store_stock rows where quantityOnHand > 0. */
  stockRowsWithQty: number
}

export function deriveTransfersPrereqs(
  input: TransfersPrereqInput,
): PrerequisiteResult {
  const missing: MissingPrereq[] = []
  if (input.shopCount === 0) missing.push(noShopsPrereq)
  if (input.stockRowsWithQty === 0) missing.push(noStoreStockPrereq)
  if (missing.length === 0) return SATISFIED
  return { satisfied: false, missing }
}

export interface ShopSalesPrereqInput {
  shopCount: number
  /** Total sale records across all shops. */
  totalSaleCount: number
}

export function deriveShopSalesPrereqs(
  input: ShopSalesPrereqInput,
): PrerequisiteResult {
  if (input.shopCount === 0) {
    return { satisfied: false, missing: [noShopsPrereq] }
  }
  if (input.totalSaleCount === 0) {
    return {
      satisfied: true,
      missing: [
        {
          id: "no-sales-yet",
          severity: "soft",
          title: "No sales recorded yet",
          why: "Record a sale at any shop and it will appear here.",
          actions: [{ label: "Record a Sale", href: "/shop" }],
        },
      ],
    }
  }
  return SATISFIED
}

export interface ShopOpeningPrereqInput {
  shopCount: number
}

export function deriveShopOpeningPrereqs(
  input: ShopOpeningPrereqInput,
): PrerequisiteResult {
  if (input.shopCount === 0) {
    return { satisfied: false, missing: [noShopsPrereq] }
  }
  return SATISFIED
}

export interface ShopPrereqInput {
  /** Null = no shop selected (page handles via inline empty state). */
  selectedShopHasStock: boolean | null
}

export function deriveShopPrereqs(input: ShopPrereqInput): PrerequisiteResult {
  if (input.selectedShopHasStock === false) {
    return {
      satisfied: true,
      missing: [
        {
          id: "shop-empty",
          severity: "soft",
          title: "This shop has no stock yet",
          why: "Transfer items from the warehouse or set a shop opening balance.",
          actions: [
            { label: "Transfer from Warehouse", href: "/store/transfers" },
            { label: "Set Opening Balance", href: "/shop/opening-balance" },
          ],
        },
      ],
    }
  }
  return SATISFIED
}

export interface StorePrereqInput {
  stockRowCount: number
}

export function deriveStorePrereqs(input: StorePrereqInput): PrerequisiteResult {
  if (input.stockRowCount === 0) {
    return {
      satisfied: true,
      missing: [
        {
          id: "warehouse-empty",
          severity: "soft",
          title: "Warehouse is empty",
          why: "Receive goods from a supply route or set an opening balance to seed stock.",
          actions: [
            { label: "Receive Goods", href: "/store/receiving" },
            { label: "Set Opening Balance", href: "/store/opening-balance" },
          ],
        },
      ],
    }
  }
  return SATISFIED
}

export interface SupplyPrereqInput {
  supplierCount: number
}

export function deriveSupplyPrereqs(
  input: SupplyPrereqInput,
): PrerequisiteResult {
  if (input.supplierCount === 0) {
    return { satisfied: true, missing: [noSuppliersPrereq] }
  }
  return SATISFIED
}
