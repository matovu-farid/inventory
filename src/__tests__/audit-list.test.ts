import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, inArray } from "drizzle-orm"

import { db } from "#/db"
import { auditLogs, user } from "#/db/schema"
import { queryAuditLog } from "#/server/functions/audit/list.server"
import { queryAuditLogByArticle } from "#/server/functions/audit/list-by-article.server"

// We call the pure query helpers directly instead of the createServerFn
// wrappers because TanStack's server-fn machinery, when invoked outside SSR,
// swallows the handler's return value (see
// opening-balance-variants.test.ts for the same workaround). RBAC and session
// gating live in the wrapper and are exercised in the route-level tests, not
// here — these tests focus on the query semantics.

// Unique test identifiers — keep all test-seeded rows isolated from other
// suites that may share the audit_logs table.
const SUFFIX = `${Date.now()}`
const ACTOR_A = `audit-list-test-a-${SUFFIX}`
const ACTOR_B = `audit-list-test-b-${SUFFIX}`
const ARTICLE_X1 = `AUDIT-LIST-TEST-X1-${SUFFIX}`
const ARTICLE_X2 = `AUDIT-LIST-TEST-X2-${SUFFIX}`

// Sentinel UUIDs we use to find back the seeded rows.
const ROW1_ID = "11111111-1111-1111-1111-111111111111"
const ROW2_ID = "22222222-2222-2222-2222-222222222222"
const ROW3_ID = "33333333-3333-3333-3333-333333333333"

const ROW1_ENTITY = "ent-1-" + SUFFIX
const ROW2_ENTITY = "ent-2-" + SUFFIX
const ROW3_ENTITY = "ent-3-" + SUFFIX

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      {
        id: ACTOR_A,
        name: "Audit Actor A",
        email: `actor-a-${SUFFIX}@example.com`,
        emailVerified: true,
        role: "admin",
      },
      {
        id: ACTOR_B,
        name: "Audit Actor B",
        email: `actor-b-${SUFFIX}@example.com`,
        emailVerified: true,
        role: "supervisor",
      },
    ])
    .onConflictDoNothing()

  // Row 1: actor A, store.receiveGoods, [X1], businessDate 2026-04-10, createdAt 2026-05-22.
  // Row 2: actor B, sale.create, [X1, X2], businessDate null, createdAt 2026-05-22.
  // Row 3: actor A, transfer.create, [X2], businessDate null, createdAt 2026-05-21.
  await db.insert(auditLogs).values([
    {
      id: ROW1_ID,
      actorUserId: ACTOR_A,
      action: "store.receiveGoods",
      entityType: "supply_route",
      entityId: ROW1_ENTITY,
      description: "Audit row 1",
      articleNumbers: [ARTICLE_X1],
      businessDate: new Date("2026-04-10T00:00:00Z"),
      createdAt: new Date("2026-05-22T10:00:00Z"),
    },
    {
      id: ROW2_ID,
      actorUserId: ACTOR_B,
      action: "sale.create",
      entityType: "shop_sale",
      entityId: ROW2_ENTITY,
      description: "Audit row 2",
      articleNumbers: [ARTICLE_X1, ARTICLE_X2],
      businessDate: null,
      createdAt: new Date("2026-05-22T11:00:00Z"),
    },
    {
      id: ROW3_ID,
      actorUserId: ACTOR_A,
      action: "transfer.create",
      entityType: "store_transfer",
      entityId: ROW3_ENTITY,
      description: "Audit row 3",
      articleNumbers: [ARTICLE_X2],
      businessDate: null,
      createdAt: new Date("2026-05-21T09:00:00Z"),
    },
  ])
})

afterAll(async () => {
  await db
    .delete(auditLogs)
    .where(inArray(auditLogs.id, [ROW1_ID, ROW2_ID, ROW3_ID]))
  await db.delete(user).where(eq(user.id, ACTOR_A))
  await db.delete(user).where(eq(user.id, ACTOR_B))
})

describe("queryAuditLog", () => {
  it("filters by article number", async () => {
    const result = await queryAuditLog({ articleNumber: ARTICLE_X1 })
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(ROW1_ID)
    expect(ids).toContain(ROW2_ID)
    expect(ids).not.toContain(ROW3_ID)
  })

  it("filters by actor", async () => {
    const result = await queryAuditLog({ actorUserId: ACTOR_A })
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(ROW1_ID)
    expect(ids).toContain(ROW3_ID)
    expect(ids).not.toContain(ROW2_ID)
  })

  it("filters by action", async () => {
    // Combine with actor filter to isolate our seeded rows from any other
    // sale.create rows that might exist in the shared table.
    const result = await queryAuditLog({
      actions: ["sale.create"],
      actorUserId: ACTOR_B,
    })
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(ROW2_ID)
    expect(ids).not.toContain(ROW1_ID)
    expect(ids).not.toContain(ROW3_ID)
  })

  it("filters by date range using business_date when present", async () => {
    // Restrict to our seeded action set so other suite rows can't interfere;
    // the date filter then determines which of OUR three rows pass.
    const result = await queryAuditLog({
      from: new Date("2026-04-01T00:00:00Z"),
      to: new Date("2026-04-30T23:59:59Z"),
      actions: ["store.receiveGoods", "sale.create", "transfer.create"],
    })
    const ids = result.rows.map((r) => r.id)
    // Row 1 has businessDate 2026-04-10 (in window). Rows 2/3 have null
    // businessDate, falling back to createdAt in May 2026 (outside window).
    const seededIds = ids.filter((id) =>
      [ROW1_ID, ROW2_ID, ROW3_ID].includes(id),
    )
    expect(seededIds).toEqual([ROW1_ID])
  })

  it("AND-combines multiple filters", async () => {
    const result = await queryAuditLog({
      articleNumber: ARTICLE_X1,
      actorUserId: ACTOR_A,
    })
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(ROW1_ID)
    expect(ids).not.toContain(ROW2_ID)
    expect(ids).not.toContain(ROW3_ID)
  })

  it("paginates with cursor", async () => {
    // Restrict to ACTOR_A so we only see 2 rows total (row 1 and row 3),
    // making the pagination boundary deterministic.
    const first = await queryAuditLog({
      actorUserId: ACTOR_A,
      pageSize: 1,
    })
    // ACTOR_A has 2 rows: row 1 (effective 2026-04-10) and row 3 (effective
    // 2026-05-21 via createdAt). DESC by effective date → row 3 first.
    expect(first.rows).toHaveLength(1)
    expect(first.rows[0].id).toBe(ROW3_ID)
    expect(first.nextCursor).not.toBeNull()

    const second = await queryAuditLog({
      actorUserId: ACTOR_A,
      pageSize: 1,
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.rows).toHaveLength(1)
    expect(second.rows[0].id).toBe(ROW1_ID)
  })
})

describe("queryAuditLogByArticle", () => {
  it("returns only rows tagged with the article", async () => {
    const result = await queryAuditLogByArticle({ articleNumber: ARTICLE_X2 })
    const ids = result.rows.map((r) => r.id)
    expect(ids).toContain(ROW2_ID)
    expect(ids).toContain(ROW3_ID)
    expect(ids).not.toContain(ROW1_ID)
  })
})
