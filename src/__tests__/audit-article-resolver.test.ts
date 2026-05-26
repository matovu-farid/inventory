import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "#/db"
import {
  items,
  itemColors,
  itemCategories,
  suppliers,
  supplyRoutes,
  supplyRouteLines,
  user,
} from "#/db/schema"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { eq } from "drizzle-orm"

const USER_ID = "00000000-0000-0000-0000-0000000000ac"
const ART_A = "ART-RES-A"
const ART_B = "ART-RES-B"

const ids: Record<string, string> = {}

beforeAll(async () => {
  await db.insert(user).values({
    id: USER_ID,
    name: "Article Resolver Test",
    email: `${USER_ID}@test.local`,
    emailVerified: true,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing()

  const [uncat] = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, "Uncategorized"))
  const [pa] = await db
    .insert(items)
    .values({ articleNumber: ART_A, name: "A", itemCategoryId: uncat.id })
    .returning()
  const [pb] = await db
    .insert(items)
    .values({ articleNumber: ART_B, name: "B", itemCategoryId: uncat.id })
    .returning()
  ids.productA = pa.id
  ids.productB = pb.id

  const [pca] = await db
    .insert(itemColors)
    .values({ itemId: pa.id, colorName: "Red", colorHex: "#f00" })
    .returning()
  ids.pcA = pca.id

  const [sup] = await db.insert(suppliers).values({ name: "Resolver Test Supplier", type: "local" }).returning()
  ids.supplierId = sup.id
  const [route] = await db.insert(supplyRoutes).values({ name: "Resolver Route" }).returning()
  ids.routeId = route.id

  const [sriA] = await db.insert(supplyRouteLines).values({
    supplyRouteId: route.id,
    supplierId: sup.id,
    itemId: pa.id,
    colorId: pca.id,
    size: "M",
    quantity: 10,
    unitPriceForeign: "10",
    totalAmountForeign: "100",
    totalCostUgx: "1000",
  }).returning()
  ids.sriA = sriA.id

  const [sriA2] = await db.insert(supplyRouteLines).values({
    supplyRouteId: route.id,
    supplierId: sup.id,
    itemId: pa.id,
    colorId: pca.id,
    size: "L",
    quantity: 5,
    unitPriceForeign: "10",
    totalAmountForeign: "50",
    totalCostUgx: "500",
  }).returning()
  ids.sriA2 = sriA2.id
})

afterAll(async () => {
  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.supplyRouteId, ids.routeId))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.id, ids.routeId))
  await db.delete(suppliers).where(eq(suppliers.id, ids.supplierId))
  await db.delete(itemColors).where(eq(itemColors.itemId, ids.productA))
  await db.delete(items).where(eq(items.id, ids.productA))
  await db.delete(items).where(eq(items.id, ids.productB))
  await db.delete(user).where(eq(user.id, USER_ID))
})

describe("resolveArticleNumbersForAudit", () => {
  it("resolves store.receiveGoods → article numbers of all route items", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: ids.routeId,
        metadata: null,
      }),
    )
    expect(out).toContain(ART_A)
  })

  it("returns empty array for unknown actions", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "unknown.action",
        entityType: "x",
        entityId: "y",
        metadata: null,
      }),
    )
    expect(out).toEqual([])
  })

  it("dedupes article numbers", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: ids.routeId,
        metadata: null,
      }),
    )
    const counts = out.reduce<Record<string, number>>((acc, a) => {
      acc[a] = (acc[a] ?? 0) + 1
      return acc
    }, {})
    expect(Object.values(counts).every((c) => c === 1)).toBe(true)
    expect(out).toEqual([ART_A])
  })

  it("excludes articles not on this route", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: ids.routeId,
        metadata: null,
      }),
    )
    expect(out).not.toContain(ART_B)
  })
})
