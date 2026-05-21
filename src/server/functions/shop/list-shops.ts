import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { shops } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const getShop = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireSession()
    const [row] = await db
      .select({ id: shops.id, name: shops.name })
      .from(shops)
      .where(eq(shops.id, data.id))
    if (!row) throw new Error("Shop not found")
    return row
  })

/**
 * Returns the shops a manager-level user is allowed to report on.
 * Admins see every shop. Supervisors see only the shop they're assigned to
 * (via `user.shopId`) — falling back to every shop if no assignment exists.
 */
export const listShopsForReports = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])
  const { role, shopId } = session.user
  const all = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .orderBy(shops.name)
  if (role === "supervisor" && shopId) {
    return all.filter((s) => s.id === shopId)
  }
  return all
})
