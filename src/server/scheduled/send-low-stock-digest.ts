import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db as defaultDb } from "#/db"
import { lowStockAlerts, shops, stores, user } from "#/db/schema"
import { sendLowStockDigest } from "#/lib/email"
import { formatProductLabel } from "#/lib/products"
import { severityForAlert, severityRank } from "#/lib/notifications/severity"
import { env } from "#/env"
import type { LowStockDigestData } from "#/lib/emails"
import type { Role } from "#/lib/roles"

type Db = typeof defaultDb
const RECIPIENT_ROLES: Role[] = ["admin", "supervisor"]
const TOP_N = 10

export interface DigestSummary {
  emailsSent: number
  alertCount: number
  recipientCount: number
}

export async function sendDailyLowStockDigestInternal(
  db: Db,
  now: Date,
): Promise<DigestSummary> {
  const alerts = await db.query.lowStockAlerts.findMany({
    where: eq(lowStockAlerts.status, "open"),
    with: { productColor: { with: { product: true } } },
  })

  if (alerts.length === 0) {
    return { emailsSent: 0, alertCount: 0, recipientCount: 0 }
  }

  const shopAlerts = alerts.filter((a) => a.scope === "shop")
  const storeAlerts = alerts.filter((a) => a.scope === "store")
  const shopIds = new Set(shopAlerts.map((a) => a.locationId))
  const storeIds = new Set(storeAlerts.map((a) => a.locationId))

  const [shopRows, storeRows] = await Promise.all([
    shopIds.size > 0
      ? db
          .select({ id: shops.id, name: shops.name })
          .from(shops)
          .where(inArray(shops.id, [...shopIds]))
      : Promise.resolve([]),
    storeIds.size > 0
      ? db
          .select({ id: stores.id, name: stores.name })
          .from(stores)
          .where(inArray(stores.id, [...storeIds]))
      : Promise.resolve([]),
  ])
  const locationName = new Map<string, string>()
  for (const r of shopRows) locationName.set(r.id, r.name)
  for (const r of storeRows) locationName.set(r.id, r.name)

  const topItems = alerts
    .map((a) => {
      const rule = a.thresholdSnapshot
      const baseline = a.baselineQuantity
      const qoh = a.quantityAtOpen
      return {
        scope: a.scope,
        locationName: locationName.get(a.locationId) ?? "(unknown)",
        productLabel: formatProductLabel(
          a.productColor.product.articleNumber,
          a.productColor.colorName,
          a.size,
        ),
        quantityOnHand: qoh,
        baseline,
        rule,
        severity: severityForAlert({ rule, baseline, quantityOnHand: qoh }),
        _rank: severityRank({ rule, baseline, quantityOnHand: qoh }),
      }
    })
    .sort((a, b) => b._rank - a._rank)
    .slice(0, TOP_N)
    .map(({ _rank, ...item }) => item)

  const recipients = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(
      and(
        isNotNull(user.role),
        inArray(user.role, RECIPIENT_ROLES),
        eq(user.emailVerified, true),
        eq(user.banned, false),
      ),
    )

  const appUrl = env.APP_URL
  let sent = 0
  for (const r of recipients) {
    const data: LowStockDigestData = {
      recipientName: r.name ?? "there",
      appUrl,
      generatedAt: now,
      storeLowCount: storeAlerts.length,
      shopLowCount: shopAlerts.length,
      shopsAffectedCount: shopIds.size,
      topItems,
      storeRequisitionsUrl: `${appUrl}/store/restock-requisitions`,
      shopSuggestionsUrl: `${appUrl}/shop`,
      manageNotificationsUrl: `${appUrl}/settings/notifications`,
    }
    try {
      await sendLowStockDigest({ to: r.email, data })
      sent++
    } catch (error) {
      console.error("[sendDailyLowStockDigest] recipient failed", {
        userId: r.id,
        error,
      })
    }
  }
  return {
    emailsSent: sent,
    alertCount: alerts.length,
    recipientCount: recipients.length,
  }
}
