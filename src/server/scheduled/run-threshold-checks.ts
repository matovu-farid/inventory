import { and, eq, inArray, sql } from 'drizzle-orm'
import type { db as defaultDb } from '#/db'
import {
  notificationThresholds,
  notificationThresholdOverrides,
  lowStockAlerts,
  restockRequisitions,
  shopStock,
  storeStock,
  variants,
  itemColors,
  items,
  shops,
} from '#/db/schema'
import {
  buildOverrideMaps,
  resolveShopRule,
  resolveStoreRule,
} from '#/lib/notifications/thresholds'
import {
  computeShopBaseline,
  computeStoreBaseline,
} from '#/lib/notifications/baseline'
import { isBelowThreshold } from '#/lib/notifications/check'
import { formatItemLabel } from '#/lib/items'
import { emitToRoles } from '#/lib/notifications/emit'
import type { Defaults, OverrideRow, Rule } from '#/lib/notifications/types'
import type { Role } from '#/lib/roles'

type Db = typeof defaultDb

export interface CheckSummary {
  shopAlertsOpened: number
  shopAlertsResolved: number
  storeAlertsOpened: number
  storeAlertsResolved: number
  requisitionsOpened: number
  requisitionsFulfilled: number
  skippedNoBaseline: number
}

const NOTIFY_ROLES: Role[] = ['admin', 'supervisor']

export async function runThresholdChecksInternal(
  db: Db,
  now: Date,
): Promise<CheckSummary> {
  const summary: CheckSummary = {
    shopAlertsOpened: 0,
    shopAlertsResolved: 0,
    storeAlertsOpened: 0,
    storeAlertsResolved: 0,
    requisitionsOpened: 0,
    requisitionsFulfilled: 0,
    skippedNoBaseline: 0,
  }

  const [defaults, overrides] = await Promise.all([
    loadDefaults(db),
    loadOverrides(db),
  ])
  const maps = buildOverrideMaps(overrides)

  await processShopStock(db, now, defaults, maps, summary)
  await processStoreStock(db, now, defaults, maps, summary)

  return summary
}

async function loadDefaults(db: Db): Promise<Defaults> {
  const row = (
    await db
      .select()
      .from(notificationThresholds)
      .where(eq(notificationThresholds.id, 'global'))
  ).at(0)
  if (!row) {
    await db
      .insert(notificationThresholds)
      .values({ id: 'global' })
      .onConflictDoNothing()
    return {
      store: { mode: 'percent', value: 30 },
      shop: { mode: 'percent', value: 15 },
    }
  }
  return {
    store: { mode: row.storeMode, value: Number(row.storeValue) },
    shop: { mode: row.shopMode, value: Number(row.shopValue) },
  }
}

async function loadOverrides(db: Db): Promise<OverrideRow[]> {
  const rows = await db.select().from(notificationThresholdOverrides)
  return rows.map((r) => ({
    scope: r.scope,
    variantId: r.variantId,
    shopId: r.shopId,
    rule: { mode: r.mode, value: Number(r.value) },
  }))
}

async function processShopStock(
  db: Db,
  now: Date,
  defaults: Defaults,
  maps: ReturnType<typeof buildOverrideMaps>,
  summary: CheckSummary,
) {
  // shop_stock keys on variant_id directly (#4). Join through variants to
  // collect the labels (item article number, color, size) needed for alert
  // copy and threshold-override lookups.
  const rows = await db
    .select({
      stockId: shopStock.id,
      shopId: shopStock.shopId,
      size: variants.size,
      quantityOnHand: shopStock.quantityOnHand,
      variantId: variants.id,
      articleNumber: items.articleNumber,
      colorName: itemColors.colorName,
      shopName: shops.name,
    })
    .from(shopStock)
    .innerJoin(variants, eq(variants.id, shopStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(shops, eq(shops.id, shopStock.shopId))
  for (const row of rows) {
    try {
      const rule = resolveShopRule(
        row.shopId,
        { variantId: row.variantId },
        maps,
        defaults,
      )
      const baseline = await computeShopBaseline(db, {
        shopId: row.shopId,
        variantId: row.variantId,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === 'no_baseline_for_percent' ||
        result.reason === 'zero_baseline'
      ) {
        summary.skippedNoBaseline++
      }
      await reconcileShopAlert(db, now, {
        shopId: row.shopId,
        variantId: row.variantId,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        itemLabel: formatItemLabel(
          row.articleNumber,
          row.colorName,
          row.size,
        ),
        shopName: row.shopName,
        summary,
      })
    } catch (error) {
      console.error('[runThresholdChecks] shop row failed', {
        shopStockId: row.stockId,
        error,
      })
    }
  }
}

async function processStoreStock(
  db: Db,
  now: Date,
  defaults: Defaults,
  maps: ReturnType<typeof buildOverrideMaps>,
  summary: CheckSummary,
) {
  const rows = await db
    .select({
      stockId: storeStock.id,
      storeId: storeStock.storeId,
      size: variants.size,
      quantityOnHand: storeStock.quantityOnHand,
      variantId: variants.id,
      articleNumber: items.articleNumber,
      colorName: itemColors.colorName,
    })
    .from(storeStock)
    .innerJoin(variants, eq(variants.id, storeStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
  for (const row of rows) {
    try {
      const rule = resolveStoreRule(
        { variantId: row.variantId },
        maps,
        defaults,
      )
      const baseline = await computeStoreBaseline(db, {
        storeId: row.storeId,
        variantId: row.variantId,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === 'no_baseline_for_percent' ||
        result.reason === 'zero_baseline'
      ) {
        summary.skippedNoBaseline++
      }
      const itemLabel = formatItemLabel(
        row.articleNumber,
        row.colorName,
        row.size,
      )
      await reconcileStoreAlert(db, now, {
        storeId: row.storeId,
        variantId: row.variantId,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        itemLabel,
        summary,
      })
    } catch (error) {
      console.error('[runThresholdChecks] store row failed', {
        storeStockId: row.stockId,
        error,
      })
    }
  }
}

interface ShopReconcileArgs {
  shopId: string
  variantId: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  itemLabel: string
  shopName: string
  summary: CheckSummary
}

async function reconcileShopAlert(db: Db, now: Date, args: ShopReconcileArgs) {
  const openAlert = (
    await db
      .select({ id: lowStockAlerts.id })
      .from(lowStockAlerts)
      .where(
        and(
          eq(lowStockAlerts.scope, 'shop'),
          eq(lowStockAlerts.locationId, args.shopId),
          eq(lowStockAlerts.variantId, args.variantId),
          eq(lowStockAlerts.status, 'open'),
        ),
      )
      .limit(1)
  ).at(0)

  if (args.below && !openAlert) {
    const opened = await openShopAlert(db, args)
    if (opened) args.summary.shopAlertsOpened++
  } else if (!args.below && openAlert) {
    await db
      .update(lowStockAlerts)
      .set({ status: 'resolved', resolvedAt: now })
      .where(eq(lowStockAlerts.id, openAlert.id))
    args.summary.shopAlertsResolved++
  }
}

async function openShopAlert(
  db: Db,
  args: ShopReconcileArgs,
): Promise<boolean> {
  let inserted = false
  await db.transaction(async (tx) => {
    const alert = (
      await tx
        .insert(lowStockAlerts)
        .values({
          scope: 'shop',
          locationId: args.shopId,
          variantId: args.variantId,
          status: 'open',
          baselineQuantity: Math.round(args.baseline),
          thresholdSnapshot: args.rule,
          quantityAtOpen: args.quantityOnHand,
        })
        .onConflictDoNothing({
          target: [
            lowStockAlerts.scope,
            lowStockAlerts.locationId,
            lowStockAlerts.variantId,
          ],
          where: sql`${lowStockAlerts.status} = 'open'`,
        })
        .returning()
    ).at(0)
    if (!alert) return // raced — another pass already opened it
    inserted = true
    const notification = await emitToRoles(tx, {
      kind: 'low_stock_open',
      title: `Low stock: ${args.itemLabel}`,
      body: `${args.shopName} has ${args.quantityOnHand} of ${args.itemLabel} left.`,
      entityType: 'low_stock_alert',
      entityId: alert.id,
      roles: NOTIFY_ROLES,
    })
    if (notification) {
      await tx
        .update(lowStockAlerts)
        .set({ notificationId: notification.id })
        .where(eq(lowStockAlerts.id, alert.id))
    }
  })
  return inserted
}

interface StoreReconcileArgs {
  storeId: string
  variantId: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  itemLabel: string
  summary: CheckSummary
}

async function reconcileStoreAlert(
  db: Db,
  now: Date,
  args: StoreReconcileArgs,
) {
  const openAlert = (
    await db
      .select({ id: lowStockAlerts.id })
      .from(lowStockAlerts)
      .where(
        and(
          eq(lowStockAlerts.scope, 'store'),
          eq(lowStockAlerts.locationId, args.storeId),
          eq(lowStockAlerts.variantId, args.variantId),
          eq(lowStockAlerts.status, 'open'),
        ),
      )
      .limit(1)
  ).at(0)

  if (args.below && !openAlert) {
    const opened = await openStoreAlertAndRequisition(db, args)
    if (opened) {
      args.summary.storeAlertsOpened++
      args.summary.requisitionsOpened++
    }
  } else if (!args.below && openAlert) {
    await db.transaction(async (tx) => {
      await tx
        .update(lowStockAlerts)
        .set({ status: 'resolved', resolvedAt: now })
        .where(eq(lowStockAlerts.id, openAlert.id))
      const fulfilled = await tx
        .update(restockRequisitions)
        .set({ status: 'fulfilled', resolvedAt: now })
        .where(
          and(
            eq(restockRequisitions.storeId, args.storeId),
            eq(restockRequisitions.variantId, args.variantId),
            inArray(restockRequisitions.status, ['open', 'planned']),
          ),
        )
        .returning()
      args.summary.requisitionsFulfilled += fulfilled.length
    })
    args.summary.storeAlertsResolved++
  }
}

async function openStoreAlertAndRequisition(
  db: Db,
  args: StoreReconcileArgs,
): Promise<boolean> {
  let inserted = false
  await db.transaction(async (tx) => {
    const suggestedQuantity = Math.max(
      0,
      Math.round(args.baseline) - args.quantityOnHand,
    )
    const alert = (
      await tx
        .insert(lowStockAlerts)
        .values({
          scope: 'store',
          locationId: args.storeId,
          variantId: args.variantId,
          status: 'open',
          baselineQuantity: Math.round(args.baseline),
          thresholdSnapshot: args.rule,
          quantityAtOpen: args.quantityOnHand,
        })
        .onConflictDoNothing({
          target: [
            lowStockAlerts.scope,
            lowStockAlerts.locationId,
            lowStockAlerts.variantId,
          ],
          where: sql`${lowStockAlerts.status} = 'open'`,
        })
        .returning()
    ).at(0)
    if (!alert) return

    inserted = true

    await tx
      .insert(restockRequisitions)
      .values({
        storeId: args.storeId,
        variantId: args.variantId,
        suggestedQuantity,
        baselineQuantity: Math.round(args.baseline),
        quantityAtOpen: args.quantityOnHand,
        status: 'open',
      })
      .onConflictDoNothing({
        target: [restockRequisitions.storeId, restockRequisitions.variantId],
        where: sql`${restockRequisitions.status} = 'open'`,
      })

    const notification = await emitToRoles(tx, {
      kind: 'low_stock_open',
      title: `Low store stock: ${args.itemLabel}`,
      body: `Only ${args.quantityOnHand} of ${args.itemLabel} left in the store. Suggested restock: ${suggestedQuantity}.`,
      entityType: 'low_stock_alert',
      entityId: alert.id,
      roles: NOTIFY_ROLES,
    })
    if (notification) {
      await tx
        .update(lowStockAlerts)
        .set({ notificationId: notification.id })
        .where(eq(lowStockAlerts.id, alert.id))
    }
  })
  return inserted
}
