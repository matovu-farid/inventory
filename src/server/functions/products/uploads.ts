import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { productColors } from "#/db/schema"
import { presignPutUrl, publicUrlFor } from "#/lib/s3/sign"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const getProductImageUploadUrl = createServerFn()
  .inputValidator(z.object({
    productColorId: z.uuid(),
    contentType: z.string().regex(/^image\//),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const color = await db.query.productColors.findFirst({
      where: eq(productColors.id, data.productColorId),
    })
    if (!color) throw new Error("Color not found")

    const key = `products/${color.productId}/${color.id}.jpg`
    const uploadUrl = await presignPutUrl({ key, contentType: data.contentType })
    return { uploadUrl, publicUrl: publicUrlFor(key), s3Key: key }
  })
