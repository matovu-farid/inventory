import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, isNull, max } from 'drizzle-orm'
import { db } from '#/db'
import type { DbOrTx, Tx } from '#/db'
import {
  itemColorImages,
  itemColors,
  items,
  pictureUploadTokens,
  pictureUploads,
} from '#/db/schema'

export const MAX_ITEM_COLOR_IMAGES = 12

export function newItemImageKey(itemId: string, itemColorId: string): string {
  return `items/${itemId}/${itemColorId}/${randomUUID()}.jpg`
}

async function attachItemColorImagesInTx(
  tx: Tx,
  input: { itemColorId: string; imageS3Keys: ReadonlyArray<string> },
) {
  if (input.imageS3Keys.length === 0) return []
  if (input.imageS3Keys.length > MAX_ITEM_COLOR_IMAGES) {
    throw new Error(`A color can have at most ${MAX_ITEM_COLOR_IMAGES} images`)
  }

  const color = await tx.query.itemColors.findFirst({
    where: eq(itemColors.id, input.itemColorId),
  })
  if (!color) throw new Error('Color not found')

  const existing = await tx
    .select({ count: max(itemColorImages.sortOrder) })
    .from(itemColorImages)
    .where(eq(itemColorImages.itemColorId, input.itemColorId))
  const firstSortOrder = Number(existing[0]?.count ?? -1) + 1
  const existingCount = await tx
    .select({ count: count() })
    .from(itemColorImages)
    .where(eq(itemColorImages.itemColorId, input.itemColorId))
  if (
    Number(existingCount[0]?.count ?? 0) + input.imageS3Keys.length >
    MAX_ITEM_COLOR_IMAGES
  ) {
    throw new Error(`A color can have at most ${MAX_ITEM_COLOR_IMAGES} images`)
  }

  const rows = await tx
    .insert(itemColorImages)
    .values(
      input.imageS3Keys.map((imageS3Key, index) => ({
        itemColorId: input.itemColorId,
        imageS3Key,
        sortOrder: firstSortOrder + index,
      })),
    )
    .returning()

  if (!color.imageS3Key && rows[0]) {
    await tx
      .update(itemColors)
      .set({ imageS3Key: rows[0].imageS3Key })
      .where(
        and(
          eq(itemColors.id, input.itemColorId),
          isNull(itemColors.imageS3Key),
        ),
      )
  }

  return rows
}

export async function attachItemColorImages(input: {
  itemColorId: string
  imageS3Keys: ReadonlyArray<string>
}) {
  return db.transaction((tx) => attachItemColorImagesInTx(tx, input))
}

export async function attachPhotoSessionImages(input: {
  token: string
  itemColorId: string
}) {
  return db.transaction(async (tx) => {
    const token = await tx.query.pictureUploadTokens.findFirst({
      where: eq(pictureUploadTokens.token, input.token),
    })
    if (!token) throw new Error('Token not found')
    if (!token.completedAt) throw new Error('Photo session is not complete')
    if (token.itemColorId && token.itemColorId !== input.itemColorId) {
      throw new Error('Color does not belong to photo session')
    }

    const color = await tx.query.itemColors.findFirst({
      where: eq(itemColors.id, input.itemColorId),
    })
    if (!color || color.itemId !== token.itemId) {
      throw new Error('Color does not belong to photo session item')
    }

    const staged = await tx.query.pictureUploads.findMany({
      where: and(
        eq(pictureUploads.tokenId, token.id),
        eq(pictureUploads.itemId, token.itemId),
        isNull(pictureUploads.attachedAt),
      ),
      orderBy: [asc(pictureUploads.createdAt)],
    })
    const uploaded = staged.filter((row) => row.uploadedAt && row.imageS3Key)
    if (uploaded.length === 0) return []

    const rows = await attachItemColorImagesInTx(tx, {
      itemColorId: input.itemColorId,
      imageS3Keys: uploaded.map((row) => row.imageS3Key),
    })
    const attachedAt = new Date()
    for (const row of uploaded) {
      await tx
        .update(pictureUploads)
        .set({ itemColorId: input.itemColorId, attachedAt })
        .where(eq(pictureUploads.id, row.id))
    }
    return rows
  })
}

export function isItemImageKeyForColor(
  key: string,
  itemId: string,
  itemColorId: string,
): boolean {
  return (
    key === `items/${itemId}/${itemColorId}.jpg` ||
    key.startsWith(`items/${itemId}/${itemColorId}/`)
  )
}

export async function assertItemColor(executor: DbOrTx, itemColorId: string) {
  const color = await executor.query.itemColors.findFirst({
    where: eq(itemColors.id, itemColorId),
  })
  if (!color) throw new Error('Color not found')
  return color
}

export async function assertItem(executor: DbOrTx, itemId: string) {
  const item = await executor.query.items.findFirst({
    where: eq(items.id, itemId),
  })
  if (!item) throw new Error('Item not found')
  return item
}
