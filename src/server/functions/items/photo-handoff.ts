import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { pictureUploadTokens } from '#/db/schema'
import { presignPutUrl, publicUrlFor } from '#/lib/s3/sign'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { env } from '#/env'
import {
  TOKEN_TTL_MS,
  generateToken,
  markConsumed,
  validateToken,
} from './photo-handoff-internals'

export const createPhotoUploadToken = createServerFn()
  .inputValidator(z.object({ itemColorId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id
    const token = generateToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await db.insert(pictureUploadTokens).values({
      token,
      itemColorId: data.itemColorId,
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
    if (!row)
      return { status: 'missing' as const, imageUrl: null as string | null }
    if (row.consumedAt) {
      return {
        status: 'consumed' as const,
        imageUrl: row.uploadedKey ? publicUrlFor(row.uploadedKey) : null,
      }
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return { status: 'expired' as const, imageUrl: null }
    }
    return { status: 'pending' as const, imageUrl: null }
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
    const key = `items/${row.itemColor.item.id}/${row.itemColor.id}.jpg`
    const uploadUrl = await presignPutUrl({
      key,
      contentType: data.contentType,
    })
    return { uploadUrl, s3Key: key }
  })

export const confirmPhotoUpload = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await validateToken(data.token)
    const key = `items/${row.itemColor.item.id}/${row.itemColor.id}.jpg`
    await markConsumed(data.token, key)
    return { imageUrl: publicUrlFor(key) }
  })
