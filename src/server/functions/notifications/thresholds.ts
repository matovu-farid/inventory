import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  notificationThresholds,
  notificationThresholdOverrides,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const modeEnum = z.enum(["percent", "units"])
const scopeEnum = z.enum(["store", "shop"])

export const getThresholds = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const [row] = await db
    .select()
    .from(notificationThresholds)
    .where(eq(notificationThresholds.id, "global"))
  if (row) {
    return {
      store: { mode: row.storeMode, value: Number(row.storeValue) },
      shop: { mode: row.shopMode, value: Number(row.shopValue) },
    }
  }
  await db
    .insert(notificationThresholds)
    .values({ id: "global" })
    .onConflictDoNothing()
  return {
    store: { mode: "percent" as const, value: 30 },
    shop: { mode: "percent" as const, value: 15 },
  }
})

const updateInput = z.object({
  store: z.object({ mode: modeEnum, value: z.number().positive() }),
  shop: z.object({ mode: modeEnum, value: z.number().positive() }),
})

export const updateThresholds = createServerFn()
  .inputValidator(updateInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .insert(notificationThresholds)
      .values({
        id: "global",
        storeMode: data.store.mode,
        storeValue: String(data.store.value),
        shopMode: data.shop.mode,
        shopValue: String(data.shop.value),
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: notificationThresholds.id,
        set: {
          storeMode: data.store.mode,
          storeValue: String(data.store.value),
          shopMode: data.shop.mode,
          shopValue: String(data.shop.value),
          updatedBy: session.user.id,
        },
      })
    return { ok: true }
  })

const listOverridesInput = z.object({
  shopId: z.uuid().optional(),
})

export const listOverrides = createServerFn()
  .inputValidator(listOverridesInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const whereClause = data.shopId
      ? eq(notificationThresholdOverrides.shopId, data.shopId)
      : undefined
    return db.query.notificationThresholdOverrides.findMany({
      where: whereClause,
      with: {
        productColor: { with: { product: true } },
        shop: true,
      },
    })
  })

const upsertOverrideInput = z.object({
  scope: scopeEnum,
  productColorId: z.uuid(),
  size: z.string().min(1),
  shopId: z.uuid().nullable(),
  mode: modeEnum,
  value: z.number().positive(),
})

export const upsertOverride = createServerFn()
  .inputValidator(upsertOverrideInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .insert(notificationThresholdOverrides)
      .values({
        scope: data.scope,
        productColorId: data.productColorId,
        size: data.size,
        shopId: data.shopId,
        mode: data.mode,
        value: String(data.value),
      })
      .onConflictDoUpdate({
        target: [
          notificationThresholdOverrides.scope,
          notificationThresholdOverrides.productColorId,
          notificationThresholdOverrides.size,
          notificationThresholdOverrides.shopId,
        ],
        set: {
          mode: data.mode,
          value: String(data.value),
        },
      })
    return { ok: true }
  })

const deleteOverrideInput = z.object({ id: z.uuid() })

export const deleteOverride = createServerFn()
  .inputValidator(deleteOverrideInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .delete(notificationThresholdOverrides)
      .where(eq(notificationThresholdOverrides.id, data.id))
    return { ok: true }
  })
