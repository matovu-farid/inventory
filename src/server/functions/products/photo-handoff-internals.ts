import { randomBytes } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "#/db"
import { pictureUploadTokens, itemColors } from "#/db/schema"

export const TOKEN_TTL_MS = 15 * 60 * 1000

export function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

export async function validateToken(token: string) {
  const row = await db.query.pictureUploadTokens.findFirst({
    where: eq(pictureUploadTokens.token, token),
    with: { productColor: { with: { product: true } } },
  })
  if (!row) throw new Error("Token not found")
  if (row.consumedAt) throw new Error("Token already used")
  if (row.expiresAt.getTime() < Date.now()) throw new Error("Token expired")
  return row
}

export async function markConsumed(token: string, s3Key: string) {
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
      .update(itemColors)
      .set({ imageS3Key: s3Key })
      .where(eq(itemColors.id, updated[0].productColorId))
  })
}
