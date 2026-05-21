import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { productColors } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const hexRule = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const addProductColor = createServerFn()
  .inputValidator(z.object({
    productId: z.uuid(),
    colorName: z.string().min(1).max(40),
    colorHex: hexRule,
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    // App-level uniqueness check on (productId, colorName) — the schema's
    // idx_pc_unique is a non-unique index, so we guard here.
    const existing = await db.query.productColors.findFirst({
      where: and(
        eq(productColors.productId, data.productId),
        eq(productColors.colorName, data.colorName),
      ),
    })
    if (existing) throw new Error(`Color "${data.colorName}" already exists for this product`)
    const [row] = await db.insert(productColors).values(data).returning()
    return row
  })

export const updateProductColor = createServerFn()
  .inputValidator(z.object({
    id: z.uuid(),
    colorName: z.string().min(1).max(40).optional(),
    colorHex: hexRule.optional(),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, ...fields } = data
    const [row] = await db.update(productColors).set(fields).where(eq(productColors.id, id)).returning()
    return row
  })

export const setProductColorImage = createServerFn()
  .inputValidator(z.object({ id: z.uuid(), imageS3Key: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db
      .update(productColors)
      .set({ imageS3Key: data.imageS3Key })
      .where(eq(productColors.id, data.id))
      .returning()
    return row
  })

export const deleteProductColor = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db.delete(productColors).where(eq(productColors.id, data.id))
  })

/**
 * Returns all product colors with their parent product, ordered by article
 * number then color name.  Used by the notification-override UI to populate
 * the variant picker.
 */
export const listProductColorsForOverrides = createServerFn().handler(
  async () => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    return db.query.productColors.findMany({
      with: { product: true },
      orderBy: (pc, { asc }) => [asc(pc.productId), asc(pc.colorName)],
    })
  },
)
