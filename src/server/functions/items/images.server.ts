import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, isNull, max } from 'drizzle-orm'
import { db } from '#/db'
import type { DbOrTx, Tx } from '#/db'
import {
  itemColorImages,
  itemColors,
  itemImages,
  items,
  pictureUploadTokens,
  pictureUploads,
} from '#/db/schema'

export const MAX_ITEM_COLOR_IMAGES = 12
export const MAX_ITEM_IMAGES = 24

export function newItemImageKey(itemId: string, itemColorId: string): string {
  return `items/${itemId}/${itemColorId}/${randomUUID()}.jpg`
}

export function newGalleryImageKey(itemId: string): string {
  return `items/${itemId}/${randomUUID()}.jpg`
}

export function isItemImageKeyForItem(key: string, itemId: string): boolean {
  return key.startsWith(`items/${itemId}/`) && !key.includes('..')
}

export interface ItemImageSuggestion {
  name: string
  hex: string
  sampledHex: string
}

async function attachItemImagesInTx(
  tx: Tx,
  input: {
    itemId: string
    images: ReadonlyArray<{
      imageS3Key: string
      suggestion?: ItemImageSuggestion
    }>
  },
) {
  if (input.images.length === 0) return []
  if (input.images.length > MAX_ITEM_IMAGES) {
    throw new Error(`An item can have at most ${MAX_ITEM_IMAGES} images`)
  }

  await assertItem(tx, input.itemId)
  if (
    input.images.some(
      ({ imageS3Key }) => !isItemImageKeyForItem(imageS3Key, input.itemId),
    )
  ) {
    throw new Error('Image key does not belong to item')
  }

  const existing = await tx
    .select({ maxSortOrder: max(itemImages.sortOrder) })
    .from(itemImages)
    .where(eq(itemImages.itemId, input.itemId))
  const firstSortOrder = Number(existing[0]?.maxSortOrder ?? -1) + 1
  const existingCount = await tx
    .select({ count: count() })
    .from(itemImages)
    .where(eq(itemImages.itemId, input.itemId))
  if (
    Number(existingCount[0]?.count ?? 0) + input.images.length >
    MAX_ITEM_IMAGES
  ) {
    throw new Error(`An item can have at most ${MAX_ITEM_IMAGES} images`)
  }

  return tx
    .insert(itemImages)
    .values(
      input.images.map(({ imageS3Key, suggestion }, index) => ({
        itemId: input.itemId,
        imageS3Key,
        sortOrder: firstSortOrder + index,
        suggestedColorName: suggestion?.name,
        suggestedColorHex: suggestion?.hex,
        sampledHex: suggestion?.sampledHex,
      })),
    )
    .returning()
}

export async function attachItemImages(input: {
  itemId: string
  images: ReadonlyArray<{
    imageS3Key: string
    suggestion?: ItemImageSuggestion
  }>
}) {
  return db.transaction((tx) => attachItemImagesInTx(tx, input))
}

async function removeItemImageRecordInTx(
  tx: Tx,
  input: { itemId: string; imageS3Key: string },
) {
  await assertItem(tx, input.itemId)
  if (!isItemImageKeyForItem(input.imageS3Key, input.itemId)) {
    throw new Error('Image key does not belong to item')
  }

  const removed = await tx
    .delete(itemImages)
    .where(
      and(
        eq(itemImages.itemId, input.itemId),
        eq(itemImages.imageS3Key, input.imageS3Key),
      ),
    )
    .returning({ imageS3Key: itemImages.imageS3Key })
  if (removed.length === 0) throw new Error('Image not found')

  const remaining = await tx
    .select({ imageS3Key: itemImages.imageS3Key })
    .from(itemImages)
    .where(eq(itemImages.itemId, input.itemId))
    .orderBy(asc(itemImages.sortOrder), asc(itemImages.createdAt))

  return {
    removedImageS3Key: input.imageS3Key,
    primaryImageS3Key: remaining[0]?.imageS3Key ?? null,
  }
}

export async function removeItemImageRecord(input: {
  itemId: string
  imageS3Key: string
}) {
  return db.transaction((tx) => removeItemImageRecordInTx(tx, input))
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

async function removeItemColorImageRecordInTx(
  tx: Tx,
  input: { itemColorId: string; imageS3Key: string },
) {
  const color = await assertItemColor(tx, input.itemColorId)
  if (!isItemImageKeyForColor(input.imageS3Key, color.itemId, color.id)) {
    throw new Error('Image key does not belong to color')
  }

  const removed = await tx
    .delete(itemColorImages)
    .where(
      and(
        eq(itemColorImages.itemColorId, input.itemColorId),
        eq(itemColorImages.imageS3Key, input.imageS3Key),
      ),
    )
    .returning({ imageS3Key: itemColorImages.imageS3Key })

  if (removed.length === 0 && color.imageS3Key !== input.imageS3Key) {
    throw new Error('Image not found')
  }

  const remaining = await tx
    .select({ imageS3Key: itemColorImages.imageS3Key })
    .from(itemColorImages)
    .where(eq(itemColorImages.itemColorId, input.itemColorId))
    .orderBy(asc(itemColorImages.sortOrder), asc(itemColorImages.createdAt))
  const primaryImageS3Key = remaining[0]?.imageS3Key ?? null

  await tx
    .update(itemColors)
    .set({ imageS3Key: primaryImageS3Key })
    .where(eq(itemColors.id, input.itemColorId))

  return {
    removedImageS3Key: input.imageS3Key,
    primaryImageS3Key,
  }
}

export async function removeItemColorImageRecord(input: {
  itemColorId: string
  imageS3Key: string
}) {
  return db.transaction((tx) => removeItemColorImageRecordInTx(tx, input))
}

export async function attachPhotoSessionImages(input: {
  token: string
  itemId?: string
  itemColorId?: string
}) {
  return db.transaction(async (tx) => {
    if (Boolean(input.itemId) === Boolean(input.itemColorId)) {
      throw new Error('Exactly one item or color is required')
    }
    const token = await tx.query.pictureUploadTokens.findFirst({
      where: eq(pictureUploadTokens.token, input.token),
    })
    if (!token) throw new Error('Token not found')
    if (!token.completedAt) throw new Error('Photo session is not complete')
    if (input.itemId) {
      if (input.itemId !== token.itemId || token.itemColorId) {
        throw new Error('Item does not belong to photo session')
      }
    } else if (
      !input.itemColorId ||
      (token.itemColorId && token.itemColorId !== input.itemColorId)
    ) {
      throw new Error('Color does not belong to photo session')
    }

    const color = input.itemColorId
      ? await tx.query.itemColors.findFirst({
          where: eq(itemColors.id, input.itemColorId),
        })
      : null
    if (input.itemColorId && (!color || color.itemId !== token.itemId)) {
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

    let rows
    if (input.itemId) {
      rows = await attachItemImagesInTx(tx, {
        itemId: input.itemId,
        images: uploaded.map((row) => ({
          imageS3Key: row.imageS3Key,
          suggestion:
            row.suggestedColorName && row.suggestedColorHex && row.sampledHex
              ? {
                  name: row.suggestedColorName,
                  hex: row.suggestedColorHex,
                  sampledHex: row.sampledHex,
                }
              : undefined,
        })),
      })
    } else {
      if (!input.itemColorId) throw new Error('Color is required')
      rows = await attachItemColorImagesInTx(tx, {
        itemColorId: input.itemColorId,
        imageS3Keys: uploaded.map((row) => row.imageS3Key),
      })
    }
    const attachedAt = new Date()
    for (const row of uploaded) {
      await tx
        .update(pictureUploads)
        .set({
          itemColorId: input.itemId ? null : input.itemColorId,
          attachedAt,
        })
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
