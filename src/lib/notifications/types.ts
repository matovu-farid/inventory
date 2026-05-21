// src/lib/notifications/types.ts

export type ThresholdMode = "percent" | "units"
export type ThresholdScope = "store" | "shop"

export interface Rule {
  mode: ThresholdMode
  value: number
}

export interface Defaults {
  store: Rule
  shop: Rule
}

export interface OverrideRow {
  scope: ThresholdScope
  productColorId: string
  size: string
  shopId: string | null
  rule: Rule
}

export interface Variant {
  productColorId: string
  size: string
}
