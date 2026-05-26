import { describe, it, expect } from 'vitest'
import {
  buildOverrideMaps,
  resolveShopRule,
  resolveStoreRule,
} from '#/lib/notifications/thresholds'
import type { OverrideRow, Defaults } from '#/lib/notifications/types'

const defaults: Defaults = {
  store: { mode: 'percent', value: 30 },
  shop: { mode: 'percent', value: 15 },
}

const VARIANT_A = { variantId: 'variant-a' }
const VARIANT_B = { variantId: 'variant-b' }
const SHOP_1 = 'shop-1'
const SHOP_2 = 'shop-2'

describe('resolveShopRule', () => {
  it('returns global shop default when no override matches', () => {
    const maps = buildOverrideMaps([])
    const rule = resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)
    expect(rule).toEqual({ mode: 'percent', value: 15 })
  })

  it('prefers variant-only shop override over global', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'shop',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    const rule = resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)
    expect(rule).toEqual({ mode: 'units', value: 10 })
  })

  it('prefers shop+variant override over variant-only override', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'shop',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 10 },
      },
      {
        scope: 'shop',
        variantId: VARIANT_A.variantId,
        shopId: SHOP_1,
        rule: { mode: 'percent', value: 25 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)).toEqual({
      mode: 'percent',
      value: 25,
    })
    // SHOP_2 still sees the variant-only override
    expect(resolveShopRule(SHOP_2, VARIANT_A, maps, defaults)).toEqual({
      mode: 'units',
      value: 10,
    })
  })

  it('ignores store-scoped overrides when resolving shop rules', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'store',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 99 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)).toEqual(
      defaults.shop,
    )
  })

  it('does not bleed across variants', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'shop',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_B, maps, defaults)).toEqual(
      defaults.shop,
    )
  })
})

describe('resolveStoreRule', () => {
  it('returns global store default when no override matches', () => {
    const maps = buildOverrideMaps([])
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual(defaults.store)
  })

  it('prefers variant override over global', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'store',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 50 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual({
      mode: 'units',
      value: 50,
    })
  })

  it('ignores shop-scoped overrides', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'shop',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual(defaults.store)
  })

  it('does not bleed across variants', () => {
    const overrides: OverrideRow[] = [
      {
        scope: 'store',
        variantId: VARIANT_A.variantId,
        shopId: null,
        rule: { mode: 'units', value: 50 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveStoreRule(VARIANT_B, maps, defaults)).toEqual(defaults.store)
  })
})
