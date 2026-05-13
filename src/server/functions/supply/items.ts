import { createServerFn } from "@tanstack/react-start"
import { eq, ilike } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { supplyRouteItems, products } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { materializeVariantRows, variantInput } from "./items-internals"

export type { MaterializedRow } from "./items-internals"

export const addSupplyRouteVariants = createServerFn()
  .inputValidator(variantInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const rows = materializeVariantRows(data)
    return db.insert(supplyRouteItems).values(rows).returning()
  })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db.delete(supplyRouteItems).where(eq(supplyRouteItems.id, data.id))
  })

export const getProductNameSuggestions = createServerFn()
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const like = `%${data.query}%`
    return db.query.products.findMany({ where: ilike(products.name, like), limit: 20 })
  })
