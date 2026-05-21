import { isPaymentStatusOpen } from "#/lib/payment-status"
import type { PaymentStatus } from "#/lib/payment-status"
import type {
  Defaults,
  OverrideRow,
  Rule,
  Variant,
} from "#/lib/notifications/types"

export type CreditSaleStatus = PaymentStatus

export interface DiscrepancyThresholds {
  discrepancyPercent: number
}

export interface OverdueThresholds {
  overdueDays: number
}

export function shouldNotifyDiscrepancy(
  systemQuantity: number,
  discrepancy: number,
  thresholds: DiscrepancyThresholds,
): boolean {
  if (systemQuantity === 0) return false
  const pct = (Math.abs(discrepancy) / systemQuantity) * 100
  return pct >= thresholds.discrepancyPercent
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function shouldNotifyOverdueCredit(
  saleDate: Date,
  status: CreditSaleStatus,
  now: Date,
  thresholds: OverdueThresholds,
): boolean {
  if (!isPaymentStatusOpen(status)) return false
  const ageDays = (now.getTime() - saleDate.getTime()) / MS_PER_DAY
  return ageDays > thresholds.overdueDays
}

// ---------- Threshold rule resolution ----------

export interface OverrideMaps {
  /** scope='shop', shopId set    → keyed by `${shopId}|${productColorId}|${size}` */
  shopWithShop: Map<string, Rule>
  /** scope='shop', shopId null    → keyed by `${productColorId}|${size}` */
  shopVariantOnly: Map<string, Rule>
  /** scope='store'                → keyed by `${productColorId}|${size}` */
  store: Map<string, Rule>
}

const variantKey = (productColorId: string, size: string) =>
  `${productColorId}|${size}`
const shopVariantKey = (shopId: string, productColorId: string, size: string) =>
  `${shopId}|${productColorId}|${size}`

export function buildOverrideMaps(rows: OverrideRow[]): OverrideMaps {
  const maps: OverrideMaps = {
    shopWithShop: new Map(),
    shopVariantOnly: new Map(),
    store: new Map(),
  }
  for (const row of rows) {
    if (row.scope === "store") {
      maps.store.set(variantKey(row.productColorId, row.size), row.rule)
    } else if (row.shopId === null) {
      maps.shopVariantOnly.set(
        variantKey(row.productColorId, row.size),
        row.rule,
      )
    } else {
      maps.shopWithShop.set(
        shopVariantKey(row.shopId, row.productColorId, row.size),
        row.rule,
      )
    }
  }
  return maps
}

export function resolveShopRule(
  shopId: string,
  variant: Variant,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const specific = maps.shopWithShop.get(
    shopVariantKey(shopId, variant.productColorId, variant.size),
  )
  if (specific) return specific
  const variantOnly = maps.shopVariantOnly.get(
    variantKey(variant.productColorId, variant.size),
  )
  if (variantOnly) return variantOnly
  return defaults.shop
}

export function resolveStoreRule(
  variant: Variant,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const override = maps.store.get(
    variantKey(variant.productColorId, variant.size),
  )
  return override ?? defaults.store
}

