import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  itemColors,
  items,
  pictureUploadTokens,
  pictureUploads,
} from '#/db/schema'
import { presignPutUrl, publicUrlFor } from '#/lib/s3/sign'
import { env } from '#/env'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  completePhotoUploadSession as completeSession,
  confirmPhotoUploadRow,
  generateToken,
  isComplete,
  reservePhotoUpload,
  TOKEN_TTL_MS,
  validateToken,
} from './photo-handoff-internals'
import { attachPhotoSessionImages as attachSessionImages } from './images.server'

const suggestionSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    sampledHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .optional()

export const createPhotoUploadToken = createServerFn()
  .inputValidator(
    z.object({ itemId: z.uuid(), itemColorId: z.uuid().optional() }),
  )
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
    })
    if (!item) throw new Error('Item not found')
    if (data.itemColorId) {
      const color = await db.query.itemColors.findFirst({
        where: and(
          eq(itemColors.id, data.itemColorId),
          eq(itemColors.itemId, data.itemId),
        ),
      })
      if (!color) throw new Error('Color does not belong to item')
    }
    const token = generateToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await db.insert(pictureUploadTokens).values({
      token,
      itemId: data.itemId,
      itemColorId: data.itemColorId,
      createdBy: session.user.id,
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
    if (!row) return { status: 'missing' as const, uploads: [] }
    if (row.expiresAt.getTime() < Date.now() && !isComplete(row)) {
      return { status: 'expired' as const, uploads: [] }
    }
    const uploads = await db.query.pictureUploads.findMany({
      where: and(
        eq(pictureUploads.tokenId, row.id),
        eq(pictureUploads.itemId, row.itemId),
      ),
      orderBy: [asc(pictureUploads.createdAt)],
    })
    return {
      status: isComplete(row) ? ('completed' as const) : ('pending' as const),
      uploads: uploads
        .filter((upload) => upload.uploadedAt)
        .map((upload) => ({
          id: upload.id,
          imageUrl: publicUrlFor(upload.imageS3Key),
          suggestedColorName: upload.suggestedColorName,
          suggestedColorHex: upload.suggestedColorHex,
          sampledHex: upload.sampledHex,
        })),
    }
  })

export const redeemPhotoUploadToken = createServerFn()
  .inputValidator(
    z.object({
      token: z.string().min(1),
      contentType: z.string().regex(/^image\//),
    }),
  )
  .handler(async ({ data }) => {
    await validateToken(data.token)
    const row = await reservePhotoUpload(data.token)
    const uploadUrl = await presignPutUrl({
      key: row.imageS3Key,
      contentType: data.contentType,
    })
    return { uploadId: row.id, uploadUrl, s3Key: row.imageS3Key }
  })

export const confirmPhotoUpload = createServerFn()
  .inputValidator(
    z.object({
      token: z.string().min(1),
      uploadId: z.uuid(),
      suggestion: suggestionSchema,
    }),
  )
  .handler(async ({ data }) => {
    const row = await confirmPhotoUploadRow(
      data.token,
      data.uploadId,
      data.suggestion,
    )
    return { imageUrl: publicUrlFor(row.imageS3Key) }
  })

export const completePhotoUploadSession = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await completeSession(data.token)
    return { completedAt: row.completedAt ?? row.consumedAt }
  })

export const attachPhotoSessionImages = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1), itemColorId: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return attachSessionImages(data)
  })
