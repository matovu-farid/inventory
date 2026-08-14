import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { items } from '#/db/schema'
import { presignPutUrl, publicUrlFor } from '#/lib/s3/sign'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  attachItemImages,
  isItemImageKeyForItem,
  newGalleryImageKey,
  removeItemImageRecord,
} from './images.server'

export const getItemImageUploadUrl = createServerFn()
  .inputValidator(
    z.object({
      itemId: z.uuid(),
      contentType: z.string().regex(/^image\//),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    const key = newGalleryImageKey(item.id)
    const uploadUrl = await presignPutUrl({
      key,
      contentType: data.contentType,
    })
    return { uploadUrl, publicUrl: publicUrlFor(key), s3Key: key }
  })

export const attachUploadedItemImage = createServerFn()
  .inputValidator(
    z.object({
      itemId: z.uuid(),
      imageS3Key: z.string().min(1),
      suggestion: z
        .object({
          name: z.string().trim().min(1).max(40),
          hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          sampledHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    if (!isItemImageKeyForItem(data.imageS3Key, item.id)) {
      throw new Error('Image key does not belong to item')
    }
    const [row] = await attachItemImages({
      itemId: item.id,
      images: [{ imageS3Key: data.imageS3Key, suggestion: data.suggestion }],
    })
    return row
  })

export const removeItemImage = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid(), imageS3Key: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return removeItemImageRecord(data)
  })
