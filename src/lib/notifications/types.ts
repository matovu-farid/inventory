// src/lib/notifications/types.ts

export type ThresholdMode = 'percent' | 'units'
export type ThresholdScope = 'store' | 'shop'

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
  // Plan 2c: overrides are item-keyed.
  itemId: string
  shopId: string | null
  rule: Rule
}

export interface Variant {
  variantId: string
}
