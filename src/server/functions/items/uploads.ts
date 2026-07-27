import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { itemColors } from '#/db/schema'
import { presignPutUrl, publicUrlFor } from '#/lib/s3/sign'
import { requireSessionAndRole } from '#/server/middleware/rbac'

export const getItemImageUploadUrl = createServerFn()
  .inputValidator(
    z.object({
      itemColorId: z.uuid(),
      contentType: z.string().regex(/^image\//),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    const color = await db.query.itemColors.findFirst({
      where: eq(itemColors.id, data.itemColorId),
    })
    if (!color) throw new Error('Color not found')

    // S3 key still uses the `items/<itemId>/...` prefix to avoid
    // breaking existing object URLs; the rename of the prefix tracks
    // with a future migration of the bucket layout, not this PR.
    const key = `items/${color.itemId}/${color.id}.jpg`
    const uploadUrl = await presignPutUrl({
      key,
      contentType: data.contentType,
    })
    return { uploadUrl, publicUrl: publicUrlFor(key), s3Key: key }
  })
