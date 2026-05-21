import { and, eq, sql } from "drizzle-orm"
import { db as defaultDb } from "#/db"
import {
  notificationThresholds,
  notificationThresholdOverrides,
  lowStockAlerts,
  restockRequisitions,
} from "#/db/schema"
import {
  buildOverrideMaps,
  resolveShopRule,
  resolveStoreRule,
} from "#/lib/notifications/thresholds"
import {
  computeShopBaseline,
  computeStoreBaseline,
} from "#/lib/notifications/baseline"
import { isBelowThreshold } from "#/lib/notifications/check"
import { formatProductLabel } from "#/lib/products"
import { emitToRoles } from "#/lib/notifications/emit"
import type { Defaults, OverrideRow, Rule } from "#/lib/notifications/types"
import type { Role } from "#/lib/roles"

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

const NOTIFY_ROLES: Role[] = ["admin", "supervisor"]

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
  const [row] = await db
    .select()
    .from(notificationThresholds)
    .where(eq(notificationThresholds.id, "global"))
  if (!row) {
    await db
      .insert(notificationThresholds)
      .values({ id: "global" })
      .onConflictDoNothing()
    return {
      store: { mode: "percent", value: 30 },
      shop: { mode: "percent", value: 15 },
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
    productColorId: r.productColorId,
    size: r.size,
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
  const rows = await db.query.shopStock.findMany({
    with: { productColor: { with: { product: true } }, shop: true },
  })
  for (const row of rows) {
    try {
      const rule = resolveShopRule(
        row.shopId,
        { productColorId: row.productColorId, size: row.size },
        maps,
        defaults,
      )
      const baseline = await computeShopBaseline(db, {
        shopId: row.shopId,
        productColorId: row.productColorId,
        size: row.size,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === "no_baseline_for_percent" ||
        result.reason === "zero_baseline"
      ) {
        summary.skippedNoBaseline++
      }
      await reconcileShopAlert(db, now, {
        shopId: row.shopId,
        productColorId: row.productColorId,
        size: row.size,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        productLabel: formatProductLabel(
          row.productColor.product.articleNumber,
          row.productColor.colorName,
          row.size,
        ),
        shopName: row.shop.name,
        summary,
      })
    } catch (error) {
      console.error("[runThresholdChecks] shop row failed", {
        shopStockId: row.id,
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
  const rows = await db.query.storeStock.findMany({
    with: { productColor: { with: { product: true } } },
  })
  for (const row of rows) {
    try {
      const rule = resolveStoreRule(
        { productColorId: row.productColorId, size: row.size },
        maps,
        defaults,
      )
      const baseline = await computeStoreBaseline(db, {
        storeId: row.storeId,
        productColorId: row.productColorId,
        size: row.size,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === "no_baseline_for_percent" ||
        result.reason === "zero_baseline"
      ) {
        summary.skippedNoBaseline++
      }
      const productLabel = formatProductLabel(
        row.productColor.product.articleNumber,
        row.productColor.colorName,
        row.size,
      )
      await reconcileStoreAlert(db, now, {
        storeId: row.storeId,
        productColorId: row.productColorId,
        size: row.size,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        productLabel,
        summary,
      })
    } catch (error) {
      console.error("[runThresholdChecks] store row failed", {
        storeStockId: row.id,
        error,
      })
    }
  }
}

interface ShopReconcileArgs {
  shopId: string
  productColorId: string
  size: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  productLabel: string
  shopName: string
  summary: CheckSummary
}

async function reconcileShopAlert(db: Db, now: Date, args: ShopReconcileArgs) {
  const [openAlert] = await db
    .select({ id: lowStockAlerts.id })
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.scope, "shop"),
        eq(lowStockAlerts.locationId, args.shopId),
        eq(lowStockAlerts.productColorId, args.productColorId),
        eq(lowStockAlerts.size, args.size),
        eq(lowStockAlerts.status, "open"),
      ),
    )
    .limit(1)

  if (args.below && !openAlert) {
    const opened = await openShopAlert(db, args)
    if (opened) args.summary.shopAlertsOpened++
  } else if (!args.below && openAlert) {
    await db
      .update(lowStockAlerts)
      .set({ status: "resolved", resolvedAt: now })
      .where(eq(lowStockAlerts.id, openAlert.id))
    args.summary.shopAlertsResolved++
  }
}

async function openShopAlert(db: Db, args: ShopReconcileArgs): Promise<boolean> {
  let inserted = false
  await db.transaction(async (tx) => {
    const [alert] = await tx
      .insert(lowStockAlerts)
      .values({
        scope: "shop",
        locationId: args.shopId,
        productColorId: args.productColorId,
        size: args.size,
        status: "open",
        baselineQuantity: Math.round(args.baseline),
        thresholdSnapshot: args.rule,
        quantityAtOpen: args.quantityOnHand,
      })
      .onConflictDoNothing({
        target: [
          lowStockAlerts.scope,
          lowStockAlerts.locationId,
          lowStockAlerts.productColorId,
          lowStockAlerts.size,
        ],
        where: sql`${lowStockAlerts.status} = 'open'`,
      })
      .returning()
    if (!alert) return // raced — another pass already opened it
    inserted = true
    const notification = await emitToRoles(tx, {
      kind: "low_stock_open",
      title: `Low stock: ${args.productLabel}`,
      body: `${args.shopName} has ${args.quantityOnHand} of ${args.productLabel} left.`,
      entityType: "low_stock_alert",
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
  productColorId: string
  size: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  productLabel: string
  summary: CheckSummary
}

async function reconcileStoreAlert(
  db: Db,
  now: Date,
  args: StoreReconcileArgs,
) {
  const [openAlert] = await db
    .select({ id: lowStockAlerts.id })
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.scope, "store"),
        eq(lowStockAlerts.locationId, args.storeId),
        eq(lowStockAlerts.productColorId, args.productColorId),
        eq(lowStockAlerts.size, args.size),
        eq(lowStockAlerts.status, "open"),
      ),
    )
    .limit(1)

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
        .set({ status: "resolved", resolvedAt: now })
        .where(eq(lowStockAlerts.id, openAlert.id))
      const fulfilled = await tx
        .update(restockRequisitions)
        .set({ status: "fulfilled", resolvedAt: now })
        .where(
          and(
            eq(restockRequisitions.storeId, args.storeId),
            eq(restockRequisitions.productColorId, args.productColorId),
            eq(restockRequisitions.size, args.size),
            eq(restockRequisitions.status, "open"),
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
    const [alert] = await tx
      .insert(lowStockAlerts)
      .values({
        scope: "store",
        locationId: args.storeId,
        productColorId: args.productColorId,
        size: args.size,
        status: "open",
        baselineQuantity: Math.round(args.baseline),
        thresholdSnapshot: args.rule,
        quantityAtOpen: args.quantityOnHand,
      })
      .onConflictDoNothing({
        target: [
          lowStockAlerts.scope,
          lowStockAlerts.locationId,
          lowStockAlerts.productColorId,
          lowStockAlerts.size,
        ],
        where: sql`${lowStockAlerts.status} = 'open'`,
      })
      .returning()
    if (!alert) return

    inserted = true

    await tx
      .insert(restockRequisitions)
      .values({
        storeId: args.storeId,
        productColorId: args.productColorId,
        size: args.size,
        suggestedQuantity,
        baselineQuantity: Math.round(args.baseline),
        quantityAtOpen: args.quantityOnHand,
        status: "open",
      })
      .onConflictDoNothing({
        target: [
          restockRequisitions.storeId,
          restockRequisitions.productColorId,
          restockRequisitions.size,
        ],
        where: sql`${restockRequisitions.status} = 'open'`,
      })

    const notification = await emitToRoles(tx, {
      kind: "low_stock_open",
      title: `Low store stock: ${args.productLabel}`,
      body: `Only ${args.quantityOnHand} of ${args.productLabel} left in the store. Suggested restock: ${suggestedQuantity}.`,
      entityType: "low_stock_alert",
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

