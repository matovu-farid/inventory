import { createServerFn } from "@tanstack/react-start"
import { eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { products } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  sizes: z.array(z.string().min(1).max(16)).default([]),
})

export const listProducts = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  return db.query.products.findMany({
    with: { colors: true },
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
})

export const getProductByArticle = createServerFn()
  .inputValidator(z.object({ articleNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return db.query.products.findFirst({
      where: eq(products.articleNumber, data.articleNumber),
      with: { colors: true },
    })
  })

export const searchProducts = createServerFn()
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    if (!data.query.trim()) {
      return db.query.products.findMany({ with: { colors: true }, limit: 20 })
    }
    const like = `%${data.query}%`
    return db.query.products.findMany({
      where: or(ilike(products.articleNumber, like), ilike(products.name, like)),
      with: { colors: true },
      limit: 20,
    })
  })

export const createProduct = createServerFn()
  .inputValidator(upsertInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db.insert(products).values(data).returning()
    return row
  })

export const updateProduct = createServerFn()
  .inputValidator(upsertInput.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, ...fields } = data
    const [row] = await db.update(products).set(fields).where(eq(products.id, id)).returning()
    return row
  })
