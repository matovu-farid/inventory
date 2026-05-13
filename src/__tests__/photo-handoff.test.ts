/**
 * Photo-handoff internals — token validation and consumption.
 * Uses the real test DB, namespaces fixtures with Date.now() for isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "#/db"
import {
  pictureUploadTokens,
  products,
  productColors,
  user as userTable,
} from "#/db/schema"
import * as _internal from "#/server/functions/products/photo-handoff-internals"

let runId: string
let userId: string
let colorId: string

async function seed() {
  runId = `ph-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  userId = runId
  await db.insert(userTable).values({
    id: userId,
    name: `Admin ${runId}`,
    email: `${runId}@test.local`,
    emailVerified: true,
    role: "admin",
  })
  const p = (
    await db
      .insert(products)
      .values({ articleNumber: runId, name: `T ${runId}`, sizes: ["M"] })
      .returning()
  )[0]
  colorId = (
    await db
      .insert(productColors)
      .values({ productId: p.id, colorName: "Red", colorHex: "#dc2626" })
      .returning()
  )[0].id
}

async function teardown() {
  await db.delete(pictureUploadTokens).where(eq(pictureUploadTokens.productColorId, colorId))
  const p = await db.query.products.findFirst({
    where: eq(products.articleNumber, runId),
  })
  if (p) {
    await db.delete(productColors).where(eq(productColors.productId, p.id))
    await db.delete(products).where(eq(products.id, p.id))
  }
  await db.delete(userTable).where(eq(userTable.id, userId))
}

describe("photo-handoff internals", () => {
  beforeEach(seed)
  afterEach(teardown)

  it("validateToken rejects expired tokens", async () => {
    const token = `${runId}-old`
    await db.insert(pictureUploadTokens).values({
      token,
      productColorId: colorId,
      createdBy: userId,
      expiresAt: new Date(Date.now() - 60_000),
    })
    await expect(_internal.validateToken(token)).rejects.toThrow(/expired/i)
  })

  it("validateToken rejects consumed tokens", async () => {
    const token = `${runId}-used`
    await db.insert(pictureUploadTokens).values({
      token,
      productColorId: colorId,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    })
    await expect(_internal.validateToken(token)).rejects.toThrow(/already used/i)
  })

  it("validateToken rejects missing tokens", async () => {
    await expect(_internal.validateToken("no-such-token")).rejects.toThrow(
      /not found/i,
    )
  })

  it("markConsumed sets consumedAt and updates productColors.imageS3Key", async () => {
    const token = `${runId}-good`
    await db.insert(pictureUploadTokens).values({
      token,
      productColorId: colorId,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const key = `products/test/${colorId}.jpg`
    await _internal.markConsumed(token, key)

    const stored = await db.query.pictureUploadTokens.findFirst({
      where: eq(pictureUploadTokens.token, token),
    })
    expect(stored?.consumedAt).toBeTruthy()
    expect(stored?.uploadedKey).toBe(key)

    const color = await db.query.productColors.findFirst({
      where: eq(productColors.id, colorId),
    })
    expect(color?.imageS3Key).toBe(key)
  })

  it("markConsumed throws if token is already consumed", async () => {
    const token = `${runId}-once`
    await db.insert(pictureUploadTokens).values({
      token,
      productColorId: colorId,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    })
    await expect(
      _internal.markConsumed(token, "products/x/y.jpg"),
    ).rejects.toThrow(/already consumed/i)
  })
})
