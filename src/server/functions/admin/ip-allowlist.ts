import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { desc, eq } from "drizzle-orm"
import { db } from "#/db"
import { adminIpAllowlist, ipBlockLog, user } from "#/db/schema"
import { systemSettings } from "#/db/schema/notifications"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { clearCaches } from "#/lib/ip-allowlist"

// ─── getIpAllowlistState ──────────────────────────────────────────────────────

export const getIpAllowlistState = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  const [settingRows, entries, recentBlocks] = await Promise.all([
    db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "ip_allowlist_enabled"))
      .limit(1),

    db
      .select({
        id: adminIpAllowlist.id,
        userId: adminIpAllowlist.userId,
        userName: user.name,
        ip: adminIpAllowlist.ip,
        lastSeenAt: adminIpAllowlist.lastSeenAt,
        createdAt: adminIpAllowlist.createdAt,
      })
      .from(adminIpAllowlist)
      .innerJoin(user, eq(adminIpAllowlist.userId, user.id))
      .orderBy(desc(adminIpAllowlist.lastSeenAt)),

    db
      .select({
        id: ipBlockLog.id,
        userId: ipBlockLog.userId,
        ip: ipBlockLog.ip,
        path: ipBlockLog.path,
        attemptedAt: ipBlockLog.attemptedAt,
      })
      .from(ipBlockLog)
      .orderBy(desc(ipBlockLog.attemptedAt))
      .limit(50),
  ])

  const enabled = settingRows[0]?.value === "true"

  return { enabled, entries, recentBlocks }
})

// ─── setIpAllowlistEnabled ───────────────────────────────────────────────────

const setEnabledInput = z.object({ enabled: z.boolean() })

export const setIpAllowlistEnabled = createServerFn()
  .inputValidator(setEnabledInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    await db
      .insert(systemSettings)
      .values({
        key: "ip_allowlist_enabled",
        value: data.enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: data.enabled, updatedAt: new Date() },
      })

    clearCaches()
    return { ok: true as const }
  })

// ─── removeAllowlistEntry ─────────────────────────────────────────────────────

const removeEntryInput = z.object({ id: z.uuid() })

export const removeAllowlistEntry = createServerFn()
  .inputValidator(removeEntryInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    await db
      .delete(adminIpAllowlist)
      .where(eq(adminIpAllowlist.id, data.id))

    clearCaches()
    return { ok: true as const }
  })

// ─── clearAllowlist ───────────────────────────────────────────────────────────

export const clearAllowlist = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  await db.delete(adminIpAllowlist)

  clearCaches()
  return { ok: true as const }
})
