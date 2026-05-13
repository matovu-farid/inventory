import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, eq, isNull } from "drizzle-orm"
import crypto from "node:crypto"
import { db } from "#/db"
import { pictureUploadTokens, productColors } from "#/db/schema"
import { presignPutUrl, publicUrlFor } from "#/lib/s3/sign"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { env } from "#/env"

const TOKEN_TTL_MS = 15 * 60 * 1000

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

async function validateToken(token: string) {
  const row = await db.query.pictureUploadTokens.findFirst({
    where: eq(pictureUploadTokens.token, token),
    with: { productColor: { with: { product: true } } },
  })
  if (!row) throw new Error("Token not found")
  if (row.consumedAt) throw new Error("Token already used")
  if (row.expiresAt.getTime() < Date.now()) throw new Error("Token expired")
  return row
}

async function markConsumed(token: string, s3Key: string) {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(pictureUploadTokens)
      .set({ consumedAt: new Date(), uploadedKey: s3Key })
      .where(
        and(
          eq(pictureUploadTokens.token, token),
          isNull(pictureUploadTokens.consumedAt),
        ),
      )
      .returning()
    if (updated.length === 0) {
      throw new Error("Token already consumed or missing")
    }
    await tx
      .update(productColors)
      .set({ imageS3Key: s3Key })
      .where(eq(productColors.id, updated[0].productColorId))
  })
}

/** Internal helpers exported for vitest. Not part of the public API. */
export const _internal = { validateToken, markConsumed }

export const createPhotoUploadToken = createServerFn()
  .inputValidator(z.object({ productColorId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const token = generateToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await db.insert(pictureUploadTokens).values({
      token,
      productColorId: data.productColorId,
      createdBy: userId,
      expiresAt,
    })
    return { token, url: `${env.APP_URL}/upload-photo/${token}`, expiresAt }
  })

export const getPhotoUploadStatus = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await db.query.pictureUploadTokens.findFirst({
      where: eq(pictureUploadTokens.token, data.token),
    })
    if (!row) return { status: "missing" as const, imageUrl: null as string | null }
    if (row.consumedAt) {
      return {
        status: "consumed" as const,
        imageUrl: row.uploadedKey ? publicUrlFor(row.uploadedKey) : null,
      }
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return { status: "expired" as const, imageUrl: null }
    }
    return { status: "pending" as const, imageUrl: null }
  })

export const redeemPhotoUploadToken = createServerFn()
  .inputValidator(
    z.object({
      token: z.string().min(1),
      contentType: z.string().regex(/^image\//),
    }),
  )
  .handler(async ({ data }) => {
    const row = await validateToken(data.token)
    const key = `products/${row.productColor.product.id}/${row.productColor.id}.jpg`
    const uploadUrl = await presignPutUrl({ key, contentType: data.contentType })
    return { uploadUrl, s3Key: key }
  })

export const confirmPhotoUpload = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await validateToken(data.token)
    const key = `products/${row.productColor.product.id}/${row.productColor.id}.jpg`
    await markConsumed(data.token, key)
    return { imageUrl: publicUrlFor(key) }
  })
