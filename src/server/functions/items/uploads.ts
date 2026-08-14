import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { presignPutUrl, publicUrlFor } from '#/lib/s3/sign'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  assertItemColor,
  attachItemColorImages,
  isItemImageKeyForColor,
  newItemImageKey,
} from './images.server'

export const getItemImageUploadUrl = createServerFn()
  .inputValidator(
    z.object({
      itemColorId: z.uuid(),
      contentType: z.string().regex(/^image\//),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    const color = await assertItemColor(db, data.itemColorId)

    // S3 key still uses the `items/<itemId>/...` prefix to avoid
    // breaking existing object URLs; the rename of the prefix tracks
    // with a future migration of the bucket layout, not this PR.
    const key = newItemImageKey(color.itemId, color.id)
    const uploadUrl = await presignPutUrl({
      key,
      contentType: data.contentType,
    })
    return { uploadUrl, publicUrl: publicUrlFor(key), s3Key: key }
  })

export const attachUploadedItemColorImage = createServerFn()
  .inputValidator(
    z.object({ itemColorId: z.uuid(), imageS3Key: z.string().min(1) }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    const color = await assertItemColor(db, data.itemColorId)
    if (!isItemImageKeyForColor(data.imageS3Key, color.itemId, color.id)) {
      throw new Error('Image key does not belong to color')
    }
    const [row] = await attachItemColorImages({
      itemColorId: data.itemColorId,
      imageS3Keys: [data.imageS3Key],
    })
    return row
  })
