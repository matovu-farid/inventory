import { isPaymentStatusOpen } from '#/lib/payment-status'
import type { PaymentStatus } from '#/lib/payment-status'
import type {
  Defaults,
  OverrideRow,
  Rule,
} from '#/lib/notifications/types'

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
  /** scope='shop', shopId set    → keyed by `${shopId}|${itemId}` */
  shopWithShop: Map<string, Rule>
  /** scope='shop', shopId null    → keyed by `${itemId}` */
  shopItemOnly: Map<string, Rule>
  /** scope='store'                → keyed by `${itemId}` */
  store: Map<string, Rule>
}

const shopItemKey = (shopId: string, itemId: string) =>
  `${shopId}|${itemId}`

export function buildOverrideMaps(rows: OverrideRow[]): OverrideMaps {
  const maps: OverrideMaps = {
    shopWithShop: new Map(),
    shopItemOnly: new Map(),
    store: new Map(),
  }
  for (const row of rows) {
    if (row.scope === 'store') {
      maps.store.set(row.itemId, row.rule)
    } else if (row.shopId === null) {
      maps.shopItemOnly.set(row.itemId, row.rule)
    } else {
      maps.shopWithShop.set(shopItemKey(row.shopId, row.itemId), row.rule)
    }
  }
  return maps
}

export interface ItemKey {
  itemId: string
}

export function resolveShopRule(
  shopId: string,
  item: ItemKey,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const specific = maps.shopWithShop.get(shopItemKey(shopId, item.itemId))
  if (specific) return specific
  const itemOnly = maps.shopItemOnly.get(item.itemId)
  if (itemOnly) return itemOnly
  return defaults.shop
}

export function resolveStoreRule(
  item: ItemKey,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const override = maps.store.get(item.itemId)
  return override ?? defaults.store
}
