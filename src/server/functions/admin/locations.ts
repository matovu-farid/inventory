import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { stores, shops } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

// ── Store (single warehouse) ──────────────────────────────────────

export const getStore = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const store = await db.query.stores.findFirst()
  return store ?? null
})

export const ensureStore = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  let store = await db.query.stores.findFirst()
  if (!store) {
    ;[store] = await db
      .insert(stores)
      .values({ name: "Main Warehouse" })
      .returning()
  }
  return store
})

const updateStoreInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  location: z.string().optional(),
})

export const updateStore = createServerFn()
  .inputValidator(updateStoreInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const { id, ...fields } = data
    const store = (await db
      .update(stores)
      .set(fields)
      .where(eq(stores.id, id))
      .returning()).at(0)
    if (!store) throw new Error("Store not found")
    return store
  })

// ── Shops (multiple retail locations) ─────────────────────────────

export const listShops = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db.select().from(shops).orderBy(shops.name)
})

const createShopInput = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  managerId: z.string().optional(),
})

export const createShop = createServerFn()
  .inputValidator(createShopInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const [shop] = await db.insert(shops).values(data).returning()
    return shop
  })

const updateShopInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  managerId: z.string().optional(),
})

export const updateShop = createServerFn()
  .inputValidator(updateShopInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const { id, ...fields } = data
    const shop = (await db
      .update(shops)
      .set(fields)
      .where(eq(shops.id, id))
      .returning()).at(0)
    if (!shop) throw new Error("Shop not found")
    return shop
  })
