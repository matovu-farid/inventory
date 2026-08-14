import { randomUUID } from 'node:crypto'
import { and, count, eq, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { pictureUploadTokens, pictureUploads } from '#/db/schema'
import {
  attachPhotoSessionImages,
  MAX_ITEM_COLOR_IMAGES,
} from './images.server'

export const TOKEN_TTL_MS = 15 * 60 * 1000

export interface PhotoSuggestionInput {
  name: string
  hex: string
  sampledHex: string
}

export function generateToken(): string {
  return randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
}

export function isComplete(row: {
  completedAt: Date | null
  consumedAt?: Date | null
}): boolean {
  return Boolean(row.completedAt ?? row.consumedAt)
}

export async function validateToken(token: string) {
  const row = await db.query.pictureUploadTokens.findFirst({
    where: eq(pictureUploadTokens.token, token),
    with: { item: true, itemColor: { with: { item: true } } },
  })
  if (!row) throw new Error('Token not found')
  if (isComplete(row)) throw new Error('Token already completed')
  if (row.expiresAt.getTime() < Date.now()) throw new Error('Token expired')
  return row
}

function validateSuggestion(value?: PhotoSuggestionInput) {
  if (!value) return
  if (!value.name.trim() || value.name.length > 40) {
    throw new Error('Invalid color suggestion name')
  }
  for (const hex of [value.hex, value.sampledHex]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      throw new Error('Invalid color suggestion hex')
    }
  }
}

export async function reservePhotoUpload(token: string) {
  return db.transaction(async (tx) => {
    // Serialize reservations per token so two rapid phone selections cannot
    // both pass the 12-photo limit before either insert is visible.
    const rows = await tx
      .select()
      .from(pictureUploadTokens)
      .where(eq(pictureUploadTokens.token, token))
      .for('update')
    if (rows.length === 0) throw new Error('Token not found')
    const row = rows[0]
    if (isComplete(row)) throw new Error('Token already completed')
    if (row.expiresAt.getTime() < Date.now()) throw new Error('Token expired')

    const totals = await tx
      .select({ count: count() })
      .from(pictureUploads)
      .where(eq(pictureUploads.tokenId, row.id))
    const reservedCount = totals.reduce(
      (sum, total) => sum + Number(total.count),
      0,
    )
    if (reservedCount >= MAX_ITEM_COLOR_IMAGES) {
      throw new Error(
        `A photo session can have at most ${MAX_ITEM_COLOR_IMAGES} images`,
      )
    }

    const imageS3Key = row.itemColorId
      ? `items/${row.itemId}/${row.itemColorId}/${randomUUID()}.jpg`
      : `items/${row.itemId}/photo-sessions/${row.id}/${randomUUID()}.jpg`
    const [upload] = await tx
      .insert(pictureUploads)
      .values({
        tokenId: row.id,
        itemId: row.itemId,
        itemColorId: row.itemColorId,
        imageS3Key,
      })
      .returning()
    return upload
  })
}

export async function confirmPhotoUploadRow(
  token: string,
  uploadId: string,
  suggestion?: PhotoSuggestionInput,
) {
  const row = await validateToken(token)
  validateSuggestion(suggestion)
  const uploads = await db
    .update(pictureUploads)
    .set({
      uploadedAt: new Date(),
      suggestedColorName: suggestion?.name ?? null,
      suggestedColorHex: suggestion?.hex ?? null,
      sampledHex: suggestion?.sampledHex ?? null,
    })
    .where(
      and(
        eq(pictureUploads.id, uploadId),
        eq(pictureUploads.tokenId, row.id),
        isNull(pictureUploads.uploadedAt),
      ),
    )
    .returning()
  if (uploads.length === 0)
    throw new Error(
      'Upload not found, already confirmed, or not owned by token',
    )
  return uploads[0]
}

export async function completePhotoUploadSession(token: string) {
  const row = await db.query.pictureUploadTokens.findFirst({
    where: eq(pictureUploadTokens.token, token),
  })
  if (!row) throw new Error('Token not found')
  if (isComplete(row)) return row
  if (row.expiresAt.getTime() < Date.now()) throw new Error('Token expired')
  const completedRows = await db
    .update(pictureUploadTokens)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(pictureUploadTokens.id, row.id),
        isNull(pictureUploadTokens.completedAt),
      ),
    )
    .returning()
  if (completedRows.length === 0)
    throw new Error('Token already completed or missing')
  return completedRows[0]
}

// Compatibility wrapper for code that used the old single-photo internals.
export async function markConsumed(token: string, s3Key: string) {
  const row = await validateToken(token)
  const [upload] = await db
    .insert(pictureUploads)
    .values({
      tokenId: row.id,
      itemId: row.itemId,
      itemColorId: row.itemColorId,
      imageS3Key: s3Key,
      uploadedAt: new Date(),
    })
    .returning()
  await completePhotoUploadSession(token)
  if (row.itemColorId) {
    await attachPhotoSessionImages({
      token,
      itemColorId: row.itemColorId,
    })
  }
  return upload
}
