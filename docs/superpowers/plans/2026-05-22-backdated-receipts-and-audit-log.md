# Backdated Receipts & Enriched Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins backdate store receipts to the date goods actually arrived, and surface an English-readable audit log filterable by article number from a global admin page and per-product Activity panel.

**Architecture:** Three pieces fit together. (1) `audit_logs` gains `description`, `article_numbers[]`, and `business_date` columns — pre-rendered sentences and GIN-indexed article references make the log human-readable and fast to filter. (2) An action-code → English template lives in one file (`descriptions.ts`) and is used both at runtime and by a one-shot backfill of existing rows. (3) The receiving function gains an optional `receivedDate` that threads through `store_receivings.receivedDate`, the ledger's `transactionDate`, and the audit row's `businessDate`, with bounds `[supply_route.departureDate, today]` and an admin-only check enforced when the date differs from today (Africa/Kampala).

**Tech Stack:** Drizzle ORM + Postgres (GIN index on `text[]`), TanStack Start server functions, Zod input validation, Vitest, Cypress, shadcn/ui + Tailwind.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `drizzle/0007_audit_log_enrichment.sql` | Migration: add `description`, `article_numbers`, `business_date`; GIN index; NOT NULL tightening. |
| `src/server/audit/descriptions.ts` | Single map from action codes to English templates; exported `renderAuditDescription(action, ctx)` plus `auditActionLabel(action)` for UI dropdowns. |
| `src/server/audit/article-numbers.ts` | Resolver: given `(action, entityType, entityId, metadata, tx)`, returns the article numbers touched. Used by both runtime (for new rows) and the backfill script. |
| `src/server/functions/audit/list.ts` | `listAuditLog(filters, cursor)` server function — admin only. |
| `src/server/functions/audit/list-by-article.ts` | `listAuditLogByArticle(articleNumber, cursor)` — admin + supervisor. |
| `scripts/backfill-audit-logs.ts` | One-shot idempotent script: fills `description` and `article_numbers` for existing rows. |
| `src/routes/settings/audit-log.tsx` | Admin-only global audit log page with filters. |
| `src/components/audit/audit-log-table.tsx` | Shared presentational table (used by global page and per-article panel). |
| `src/components/audit/audit-activity-panel.tsx` | Per-article "Activity" section embedded in the product detail page. |
| `src/__tests__/audit-descriptions.test.ts` | Table-driven test, one row per action code. |
| `src/__tests__/audit-article-resolver.test.ts` | Resolver returns correct article list per action. |
| `src/__tests__/receiving-backdate.test.ts` | Integration: bounds, role check, threading of date into 3 sinks. |
| `src/__tests__/audit-list.test.ts` | `listAuditLog` filter combinations + pagination. |
| `cypress/e2e/12-audit-log.cy.ts` | Golden path: admin backdates a receipt, sees the row on both audit views. |

**Modified files:**

| Path | Change |
|---|---|
| `src/db/schema/audit-logs.ts` | Add 3 columns + GIN index. |
| `src/server/middleware/audit.ts` | Extend `AuditEntryParams` and `AuditEntry` with new required fields. |
| `src/server/middleware/audit-store.ts` | Pass new fields through to insert. |
| `src/server/functions/store/receiving.ts` | Accept `receivedDate`, validate, thread into receiving row + ledger + audit. |
| `src/routes/store/receiving.tsx` | Add date picker (defaulted to today; disabled for non-admins). |
| `src/lib/help-dictionary.ts` | Add `field.receivedDate`, `col.businessDate`, `col.recordedDate`, `col.actor`, `col.activity`, `col.filterArticle`, `col.filterActor`, `col.filterAction`, `col.filterDateRange`. |
| `src/server/functions/customers/payments.ts` | Pass `description` + `articleNumbers` to `recordAuditLog`. |
| `src/server/functions/shop/stock-take.ts` | Same. |
| `src/server/functions/shop/returns.ts` | Same. |
| `src/server/functions/shop/sales.ts` | Same. |
| `src/server/functions/store/returns.ts` | Same. |
| `src/server/functions/store/transfers.ts` | Same. |
| `src/server/functions/admin/opening-balance.ts` | Same. |
| `src/server/functions/admin/import-excel.ts` | Same. |
| `src/routes/products/$articleNumber.tsx` | Mount the Activity panel for admin + supervisor. |
| `src/__tests__/audit-log.test.ts` | Update existing buildAuditEntry tests to pass the new required fields. |

---

## Task 1: Database migration — new columns and index

**Files:**
- Create: `drizzle/0007_audit_log_enrichment.sql`
- Modify: `src/db/schema/audit-logs.ts`

- [ ] **Step 1: Update the schema file**

Replace `src/db/schema/audit-logs.ts` contents with:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    description: text("description").notNull(),
    articleNumbers: text("article_numbers")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    businessDate: timestamp("business_date", { withTimezone: true }),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_audit_actor").on(table.actorUserId),
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_action").on(table.action),
    index("idx_audit_created_at").on(table.createdAt),
    index("idx_audit_business_date").on(table.businessDate),
    index("idx_audit_articles").using("gin", table.articleNumbers),
  ],
)
```

- [ ] **Step 2: Generate the migration SQL**

Run: `pnpm db:generate`

Expected: a new `drizzle/0007_*.sql` file appears with the three `ADD COLUMN` statements, the GIN index, and the business_date index.

- [ ] **Step 3: Rename the generated file**

If drizzle-kit named the file something other than `0007_audit_log_enrichment.sql`, rename it to that. Inspect the generated SQL — it should contain:

```sql
ALTER TABLE "audit_logs" ADD COLUMN "description" text NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN "article_numbers" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN "business_date" timestamp with time zone;
CREATE INDEX "idx_audit_business_date" ON "audit_logs" USING btree ("business_date");
CREATE INDEX "idx_audit_articles" ON "audit_logs" USING gin ("article_numbers");
```

The generated `description` will be `NOT NULL` immediately. We need to soften this for the backfill — open the SQL and change `"description" text NOT NULL` to `"description" text`. We'll tighten it in Task 10 after backfill.

- [ ] **Step 4: Push to the local DB**

Run: `pnpm db:push:all`

Expected: drizzle prompts to apply; confirm. Both dev and test DBs get the change.

- [ ] **Step 5: Verify columns exist**

Run: `psql "$DATABASE_URL" -c "\d audit_logs"`

Expected: see `description text`, `article_numbers text[]`, `business_date timestamp with time zone`, plus the two new indexes.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0007_audit_log_enrichment.sql drizzle/meta/ src/db/schema/audit-logs.ts
git commit -m "feat(audit): add description, article_numbers, business_date columns"
```

---

## Task 2: Description renderer

**Files:**
- Create: `src/server/audit/descriptions.ts`
- Create: `src/__tests__/audit-descriptions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/audit-descriptions.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  renderAuditDescription,
  auditActionLabel,
  AUDIT_ACTION_LABELS,
} from "#/server/audit/descriptions"

describe("renderAuditDescription", () => {
  it("renders store.receiveGoods with both dates when backdated", () => {
    const out = renderAuditDescription("store.receiveGoods", {
      actorName: "Mary",
      routeName: "Spring 2026",
      itemCount: 3,
      totalReceived: 48,
      totalTransitLoss: 0,
      businessDate: new Date("2026-04-10T00:00:00Z"),
      recordedAt: new Date("2026-05-22T10:00:00Z"),
    })
    expect(out).toContain("Mary received")
    expect(out).toContain("Spring 2026")
    expect(out).toContain("2026-04-10")
    expect(out).toContain("2026-05-22")
  })

  it("renders store.receiveGoods without business-date phrase when same-day", () => {
    const sameDay = new Date("2026-05-22T10:00:00Z")
    const out = renderAuditDescription("store.receiveGoods", {
      actorName: "Mary",
      routeName: "Spring 2026",
      itemCount: 3,
      totalReceived: 48,
      totalTransitLoss: 0,
      businessDate: sameDay,
      recordedAt: sameDay,
    })
    expect(out).not.toMatch(/business date/i)
  })

  it("renders sale.create with shop and amount", () => {
    const out = renderAuditDescription("sale.create", {
      actorName: "Janet",
      shopName: "Kireka",
      itemCount: 2,
      totalAmount: "80000",
      paymentMethod: "cash",
    })
    expect(out).toContain("Janet sold")
    expect(out).toContain("Kireka")
    expect(out).toContain("80,000")
    expect(out).toContain("cash")
  })

  it("renders transfer.create with from/to locations", () => {
    const out = renderAuditDescription("transfer.create", {
      actorName: "James",
      shopName: "Kireka",
      itemCount: 5,
    })
    expect(out).toContain("James dispatched")
    expect(out).toContain("Kireka")
  })

  it("renders every known action without throwing", () => {
    for (const action of Object.keys(AUDIT_ACTION_LABELS)) {
      const out = renderAuditDescription(action, {
        actorName: "User",
        recordedAt: new Date(),
      })
      expect(typeof out).toBe("string")
      expect(out.length).toBeGreaterThan(0)
    }
  })

  it("auditActionLabel returns the friendly name", () => {
    expect(auditActionLabel("store.receiveGoods")).toMatch(/receive/i)
    expect(auditActionLabel("sale.create")).toMatch(/sale/i)
  })

  it("auditActionLabel falls back to the action code for unknown actions", () => {
    expect(auditActionLabel("custom.unknown")).toBe("custom.unknown")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/audit-descriptions.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the renderer**

Create `src/server/audit/descriptions.ts`:

```ts
import { formatUgxTotal } from "#/lib/format"

export const AUDIT_ACTION_LABELS = {
  "store.receiveGoods": "Received goods",
  "transfer.create": "Dispatched transfer",
  "transfer.receive": "Received transfer at shop",
  "sale.create": "Recorded sale",
  "shopReturn.create": "Recorded shop return",
  "storeReturn.dispatch": "Dispatched store return",
  "storeReturn.receive": "Received store return",
  "stockTake.start": "Started stock take",
  "stockTake.reconcile": "Reconciled stock take",
  "customerPayment.record": "Recorded customer payment",
  "customerPayment.writeOff": "Wrote off customer balance",
  "openingBalance.store": "Set warehouse opening balance",
  "openingBalance.shop": "Set shop opening balance",
  "import.excel.route": "Imported supply route from Excel",
  "import.excel.skip_sheet": "Skipped Excel sheet during import",
} as const

export type AuditActionCode = keyof typeof AUDIT_ACTION_LABELS

export interface AuditDescriptionContext {
  actorName: string
  recordedAt?: Date
  businessDate?: Date | null
  // Per-action optional fields
  routeName?: string
  shopName?: string
  storeName?: string
  itemCount?: number
  totalReceived?: number
  totalTransitLoss?: number
  totalAmount?: string
  paymentMethod?: string
  documentNumber?: string
  filename?: string
  sheetName?: string
  reason?: string
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD in UTC; OK for display
}

function dateTail(ctx: AuditDescriptionContext): string {
  if (!ctx.businessDate || !ctx.recordedAt) return ""
  const business = formatDay(ctx.businessDate)
  const recorded = formatDay(ctx.recordedAt)
  if (business === recorded) return ""
  return ` Business date ${business}, recorded ${recorded}.`
}

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action
}

export function renderAuditDescription(
  action: string,
  ctx: AuditDescriptionContext,
): string {
  const actor = ctx.actorName || "Someone"
  switch (action) {
    case "store.receiveGoods": {
      const tail = dateTail(ctx)
      const loss =
        ctx.totalTransitLoss && ctx.totalTransitLoss > 0
          ? ` (${ctx.totalTransitLoss} lost in transit)`
          : ""
      return `${actor} received ${ctx.totalReceived ?? 0} units across ${ctx.itemCount ?? 0} item(s) on supply route '${ctx.routeName ?? "(unknown)"}'${loss}.${tail}`
    }
    case "transfer.create":
      return `${actor} dispatched ${ctx.itemCount ?? 0} item(s) from the warehouse to ${ctx.shopName ?? "(unknown shop)"}.`
    case "transfer.receive":
      return `${actor} received ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"}.`
    case "sale.create": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      const method = ctx.paymentMethod ? ` (${ctx.paymentMethod})` : ""
      return `${actor} sold ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"} for ${total}${method}.`
    }
    case "shopReturn.create":
      return `${actor} recorded a return of ${ctx.itemCount ?? 0} item(s) at ${ctx.shopName ?? "(unknown shop)"}.`
    case "storeReturn.dispatch":
      return `${actor} dispatched a return of ${ctx.itemCount ?? 0} item(s) from ${ctx.shopName ?? "(unknown shop)"} to the warehouse.`
    case "storeReturn.receive":
      return `${actor} received the return of ${ctx.itemCount ?? 0} item(s) at the warehouse.`
    case "stockTake.start":
      return `${actor} started a stock take at ${ctx.shopName ?? ctx.storeName ?? "(unknown location)"}.`
    case "stockTake.reconcile":
      return `${actor} reconciled a stock take at ${ctx.shopName ?? ctx.storeName ?? "(unknown location)"} — ${ctx.itemCount ?? 0} adjustment(s).`
    case "customerPayment.record": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      return `${actor} recorded a customer payment of ${total}${ctx.documentNumber ? ` (${ctx.documentNumber})` : ""}.`
    }
    case "customerPayment.writeOff": {
      const total = ctx.totalAmount ? formatUgxTotal(ctx.totalAmount) : "UGX 0"
      return `${actor} wrote off ${total} of customer balance.`
    }
    case "openingBalance.store":
      return `${actor} set the warehouse opening balance (${ctx.itemCount ?? 0} stock line(s)).`
    case "openingBalance.shop":
      return `${actor} set the opening balance for ${ctx.shopName ?? "(unknown shop)"} (${ctx.itemCount ?? 0} stock line(s)).`
    case "import.excel.route":
      return `${actor} imported supply route from '${ctx.filename ?? "(file)"}'${ctx.sheetName ? ` (sheet: ${ctx.sheetName})` : ""}.`
    case "import.excel.skip_sheet":
      return `${actor} skipped Excel sheet '${ctx.sheetName ?? "(sheet)"}' during import${ctx.reason ? `: ${ctx.reason}` : ""}.`
    default:
      return `${actor} performed action: ${action}.`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/audit-descriptions.test.ts`

Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/audit/descriptions.ts src/__tests__/audit-descriptions.test.ts
git commit -m "feat(audit): English descriptions for all action codes"
```

---

## Task 3: Article-number resolver

**Files:**
- Create: `src/server/audit/article-numbers.ts`
- Create: `src/__tests__/audit-article-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/audit-article-resolver.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "#/db"
import {
  products,
  productColors,
  suppliers,
  supplyRoutes,
  supplyRouteItems,
  storeReceivings,
  stores,
  storeStock,
  shops,
  shopStock,
  shopSales,
  shopSaleItems,
  storeTransfers,
  storeTransferItems,
  shopReturns,
  shopReturnItems,
  user,
} from "#/db/schema"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { eq } from "drizzle-orm"

const USER_ID = "00000000-0000-0000-0000-0000000000ac"
const ART_A = "ART-RES-A"
const ART_B = "ART-RES-B"

const ids: Record<string, string> = {}

beforeAll(async () => {
  await db.insert(user).values({
    id: USER_ID,
    name: "Article Resolver Test",
    email: `${USER_ID}@test.local`,
    emailVerified: true,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing()

  const [pa] = await db.insert(products).values({ articleNumber: ART_A, name: "A" }).returning()
  const [pb] = await db.insert(products).values({ articleNumber: ART_B, name: "B" }).returning()
  ids.productA = pa.id
  ids.productB = pb.id

  const [pca] = await db.insert(productColors).values({ productId: pa.id, colorName: "Red", colorHex: "#f00" }).returning()
  const [pcb] = await db.insert(productColors).values({ productId: pb.id, colorName: "Blue", colorHex: "#00f" }).returning()
  ids.pcA = pca.id
  ids.pcB = pcb.id

  const [sup] = await db.insert(suppliers).values({ name: "Resolver Test Supplier" }).returning()
  const [route] = await db.insert(supplyRoutes).values({ name: "Resolver Route" }).returning()
  ids.routeId = route.id

  const [sriA] = await db.insert(supplyRouteItems).values({
    supplyRouteId: route.id,
    supplierId: sup.id,
    productId: pa.id,
    productColorId: pca.id,
    size: "M",
    quantity: 10,
    unitPriceForeign: "10",
    totalAmountForeign: "100",
    totalCostUgx: "1000",
  }).returning()
  ids.sriA = sriA.id
})

afterAll(async () => {
  await db.delete(supplyRouteItems).where(eq(supplyRouteItems.supplyRouteId, ids.routeId))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.id, ids.routeId))
  await db.delete(productColors).where(eq(productColors.productId, ids.productA))
  await db.delete(productColors).where(eq(productColors.productId, ids.productB))
  await db.delete(products).where(eq(products.id, ids.productA))
  await db.delete(products).where(eq(products.id, ids.productB))
  await db.delete(user).where(eq(user.id, USER_ID))
})

describe("resolveArticleNumbersForAudit", () => {
  it("resolves store.receiveGoods → article numbers of all route items", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: ids.routeId,
        metadata: null,
      }),
    )
    expect(out).toContain(ART_A)
  })

  it("returns empty array for unknown actions", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "unknown.action",
        entityType: "x",
        entityId: "y",
        metadata: null,
      }),
    )
    expect(out).toEqual([])
  })

  it("dedupes article numbers", async () => {
    const out = await db.transaction(async (tx) =>
      resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: ids.routeId,
        metadata: null,
      }),
    )
    const counts = out.reduce<Record<string, number>>((acc, a) => {
      acc[a] = (acc[a] ?? 0) + 1
      return acc
    }, {})
    expect(Object.values(counts).every((c) => c === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/audit-article-resolver.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `src/server/audit/article-numbers.ts`:

```ts
import { eq, inArray } from "drizzle-orm"
import {
  products,
  productColors,
  supplyRouteItems,
  storeStock,
  shopStock,
  storeTransfers,
  storeTransferItems,
  shopSales,
  shopSaleItems,
  shopReturns,
  shopReturnItems,
  storeReturns,
  storeReturnItems,
  stockTakes,
  stockTakeItems,
} from "#/db/schema"
import type { Database } from "#/db"

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

interface ResolverInput {
  action: string
  entityType: string
  entityId: string
  metadata: unknown
}

export async function resolveArticleNumbersForAudit(
  tx: Tx,
  input: ResolverInput,
): Promise<string[]> {
  const fn = RESOLVERS[input.action]
  if (!fn) return []
  const raw = await fn(tx, input)
  return Array.from(new Set(raw)).sort()
}

type Resolver = (tx: Tx, input: ResolverInput) => Promise<string[]>

const RESOLVERS: Record<string, Resolver> = {
  "store.receiveGoods": async (tx, { entityId }) => {
    const rows = await tx
      .select({ articleNumber: products.articleNumber })
      .from(supplyRouteItems)
      .innerJoin(productColors, eq(productColors.id, supplyRouteItems.productColorId))
      .innerJoin(products, eq(products.id, productColors.productId))
      .where(eq(supplyRouteItems.supplyRouteId, entityId))
    return rows.map((r) => r.articleNumber)
  },
  "transfer.create": resolveByTransferId,
  "transfer.receive": resolveByTransferId,
  "sale.create": resolveBySaleId,
  "shopReturn.create": resolveByShopReturnId,
  "storeReturn.dispatch": resolveByStoreReturnId,
  "storeReturn.receive": resolveByStoreReturnId,
  "stockTake.reconcile": resolveByStockTakeId,
  "stockTake.start": resolveByStockTakeId,
  // openingBalance.* — entityId is the location, articles vary; skip (empty).
  // customerPayment.* — not article-specific (touches a sale's balance, not items).
  // import.excel.* — many articles in one row; skip backfill, future enhancement.
}

async function resolveByTransferId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: products.articleNumber })
    .from(storeTransferItems)
    .innerJoin(storeStock, eq(storeStock.id, storeTransferItems.storeStockId))
    .innerJoin(productColors, eq(productColors.id, storeStock.productColorId))
    .innerJoin(products, eq(products.id, productColors.productId))
    .where(eq(storeTransferItems.storeTransferId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveBySaleId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: products.articleNumber })
    .from(shopSaleItems)
    .innerJoin(shopStock, eq(shopStock.id, shopSaleItems.shopStockId))
    .innerJoin(productColors, eq(productColors.id, shopStock.productColorId))
    .innerJoin(products, eq(products.id, productColors.productId))
    .where(eq(shopSaleItems.shopSaleId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveByShopReturnId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: products.articleNumber })
    .from(shopReturnItems)
    .innerJoin(shopStock, eq(shopStock.id, shopReturnItems.shopStockId))
    .innerJoin(productColors, eq(productColors.id, shopStock.productColorId))
    .innerJoin(products, eq(products.id, productColors.productId))
    .where(eq(shopReturnItems.shopReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveByStoreReturnId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: products.articleNumber })
    .from(storeReturnItems)
    .innerJoin(storeStock, eq(storeStock.id, storeReturnItems.storeStockId))
    .innerJoin(productColors, eq(productColors.id, storeStock.productColorId))
    .innerJoin(products, eq(products.id, productColors.productId))
    .where(eq(storeReturnItems.storeReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveByStockTakeId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: products.articleNumber })
    .from(stockTakeItems)
    .innerJoin(productColors, eq(productColors.id, stockTakeItems.productColorId))
    .innerJoin(products, eq(products.id, productColors.productId))
    .where(eq(stockTakeItems.stockTakeId, entityId))
  return rows.map((r) => r.articleNumber)
}
```

- [ ] **Step 4: Verify the join column names against the live schema**

Run: `grep -n "productColorId\|shopStockId\|storeStockId\|stockTakeId\|shopReturnId\|storeReturnId\|storeTransferId\|shopSaleId" src/db/schema/returns.ts src/db/schema/stock-takes.ts src/db/schema/transfers.ts src/db/schema/sales.ts`

Expected: column names match the resolver's joins. Fix any mismatches (e.g. if `stockTakeItems` uses a different column name).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/__tests__/audit-article-resolver.test.ts`

Expected: PASS (3 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/audit/article-numbers.ts src/__tests__/audit-article-resolver.test.ts
git commit -m "feat(audit): resolver maps audit rows to article numbers"
```

---

## Task 4: Audit middleware accepts new fields

**Files:**
- Modify: `src/server/middleware/audit.ts`
- Modify: `src/server/middleware/audit-store.ts`
- Modify: `src/__tests__/audit-log.test.ts`

- [ ] **Step 1: Update existing tests to pass new required fields**

Open `src/__tests__/audit-log.test.ts` and update every `buildAuditEntry` call to include `description: "test"` and `articleNumbers: []`. Add a new test at the end:

```ts
  it("requires description and articleNumbers", () => {
    expect(() =>
      // @ts-expect-error -- intentionally missing required fields
      buildAuditEntry({
        actorUserId: "user-1",
        action: "x.y",
        entityType: "x",
        entityId: "y",
      }),
    ).toThrow(/description/i)
  })

  it("captures description, articleNumbers, businessDate", () => {
    const business = new Date("2026-04-10T00:00:00Z")
    const entry = buildAuditEntry({
      actorUserId: "user-1",
      action: "store.receiveGoods",
      entityType: "supply_route",
      entityId: "route-1",
      description: "Mary received 48 units.",
      articleNumbers: ["CB-1234", "CB-5678"],
      businessDate: business,
    })
    expect(entry.description).toBe("Mary received 48 units.")
    expect(entry.articleNumbers).toEqual(["CB-1234", "CB-5678"])
    expect(entry.businessDate).toEqual(business)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/__tests__/audit-log.test.ts`

Expected: FAIL — `description`/`articleNumbers` not on type / not validated.

- [ ] **Step 3: Update the middleware**

Replace `src/server/middleware/audit.ts`:

```ts
export interface AuditEntryParams {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  description: string
  articleNumbers: string[]
  businessDate?: Date | null
  before?: unknown
  after?: unknown
  metadata?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}

export interface AuditEntry {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  description: string
  articleNumbers: string[]
  businessDate: Date | null
  before: unknown
  after: unknown
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export function buildAuditEntry(params: AuditEntryParams): AuditEntry {
  if (!params.actorUserId) throw new Error("audit: actorUserId required")
  if (!params.action) throw new Error("audit: action required")
  if (!params.entityType) throw new Error("audit: entityType required")
  if (!params.entityId) throw new Error("audit: entityId required")
  if (!params.description) throw new Error("audit: description required")
  if (!Array.isArray(params.articleNumbers)) {
    throw new Error("audit: articleNumbers must be an array")
  }

  return {
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    description: params.description,
    articleNumbers: params.articleNumbers,
    businessDate: params.businessDate ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    createdAt: new Date(),
  }
}
```

`audit-store.ts` needs no changes — it passes the whole entry to `tx.insert(auditLogs).values(entry)`, and the new fields now match drizzle column names.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/__tests__/audit-log.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

Expected: many errors at audit call sites (we'll fix them in Task 5). The `audit.ts` and `audit-store.ts` files themselves should be clean. If anything else surfaces, fix it before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/server/middleware/audit.ts src/__tests__/audit-log.test.ts
git commit -m "feat(audit): require description and articleNumbers in audit entries"
```

---

## Task 5: Update all existing call sites to pass new fields

**Files (all modify):**
- `src/server/functions/customers/payments.ts` (2 calls)
- `src/server/functions/shop/stock-take.ts` (2 calls)
- `src/server/functions/shop/returns.ts` (1 call)
- `src/server/functions/shop/sales.ts` (1 call)
- `src/server/functions/store/returns.ts` (2 calls)
- `src/server/functions/store/transfers.ts` (2 calls)
- `src/server/functions/admin/opening-balance.ts` (1-2 calls)
- `src/server/functions/admin/import-excel.ts` (2 calls)

Each call site follows the same pattern: pull the actor name once, resolve article numbers from in-scope data, build the description, pass to `recordAuditLog`. Do receiving last (Task 7) — its receivedDate threading needs the date-validation logic.

- [ ] **Step 1: Identify the user-display helper**

Run: `grep -rn "getActorName\|actorName\|user.name" src/server/functions/ --include="*.ts" | head -10`

If there's no helper, add one in `src/server/audit/actor.ts`:

```ts
import { eq } from "drizzle-orm"
import { user } from "#/db/schema"
import type { Database } from "#/db"

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

export async function getActorName(tx: Tx, userId: string): Promise<string> {
  const rows = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1)
  return rows[0]?.name ?? "(unknown user)"
}
```

- [ ] **Step 2: Update `customers/payments.ts`**

For each `recordAuditLog` call:
1. Add `const actorName = await getActorName(tx, userId)` near the top of the transaction.
2. Resolve article numbers — payment events don't touch article-level rows, so pass `articleNumbers: []`.
3. Build description with `renderAuditDescription(action, { actorName, totalAmount: data.amount, documentNumber: docNumber.formatted })` for `customerPayment.record`, and `renderAuditDescription("customerPayment.writeOff", { actorName, totalAmount: sale.outstandingBalance })` for the write-off.

Diff for the first call (`customerPayment.record`):

```diff
       await recordAuditLog(tx, {
         actorUserId: userId,
         action: "customerPayment.record",
         entityType: "customer_payment",
         entityId: payment.id,
+        description: renderAuditDescription("customerPayment.record", {
+          actorName,
+          totalAmount: data.amount,
+          documentNumber: docNumber.formatted,
+        }),
+        articleNumbers: [],
         after: {
           customerId: data.customerId,
           shopId: data.shopId,
           documentNumber: docNumber.formatted,
           // ...existing fields
         },
       })
```

Apply the same shape to the write-off call. Add the imports at the top:

```ts
import { renderAuditDescription } from "#/server/audit/descriptions"
import { getActorName } from "#/server/audit/actor"
```

- [ ] **Step 3: Update `shop/stock-take.ts`**

Same pattern. For both calls, pass:
- `description: renderAuditDescription(action, { actorName, shopName, storeName, itemCount })` — pull `shopName`/`storeName` from the already-loaded shop or store row.
- `articleNumbers: await resolveArticleNumbersForAudit(tx, { action, entityType, entityId, metadata: null })`.

- [ ] **Step 4: Update `shop/returns.ts`** — `shopReturn.create`

Resolve `articleNumbers` via the resolver. Build description with `shopName` and `itemCount = data.items.length`.

- [ ] **Step 5: Update `shop/sales.ts`** — `sale.create`

Resolve `articleNumbers` via the resolver. Build description with `shopName`, `itemCount = data.items.length`, `totalAmount`, `paymentMethod`.

- [ ] **Step 6: Update `store/returns.ts`** — both dispatch and receive

`storeReturn.dispatch`: pass `shopName` (the returning shop), `itemCount`. Use resolver.
`storeReturn.receive`: same, but the actor is at the warehouse.

- [ ] **Step 7: Update `store/transfers.ts`** — both create and receive

`transfer.create`: pass `shopName` (destination), `itemCount = data.items.length`. Use resolver.
`transfer.receive`: same, `actorName` is the shop receiver.

- [ ] **Step 8: Update `admin/opening-balance.ts`** — both store and shop

`openingBalance.store`: `itemCount = data.items.length`, `articleNumbers: []` (resolver doesn't cover opening balances — could be added later; empty is correct).
`openingBalance.shop`: same + `shopName`.

- [ ] **Step 9: Update `admin/import-excel.ts`** — both route and skip_sheet

`import.excel.route`: pass `filename` and optionally `sheetName`. `articleNumbers: []` (deferred enhancement).
`import.excel.skip_sheet`: `filename`, `sheetName`, `reason`.

- [ ] **Step 10: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

Expected: only the receiving file still errors (we update it in Task 7) plus any pre-existing diagnostics outside this work. If there are unexpected errors, fix them.

- [ ] **Step 11: Run the full test suite**

Run: `pnpm test`

Expected: existing integration tests that exercise these functions pass with the new fields filled in. Fix any failures.

- [ ] **Step 12: Commit**

```bash
git add src/server/audit/actor.ts src/server/functions/customers/payments.ts src/server/functions/shop/stock-take.ts src/server/functions/shop/returns.ts src/server/functions/shop/sales.ts src/server/functions/store/returns.ts src/server/functions/store/transfers.ts src/server/functions/admin/opening-balance.ts src/server/functions/admin/import-excel.ts
git commit -m "feat(audit): pass description and articleNumbers from all call sites"
```

---

## Task 6: Backfill script for existing audit rows

**Files:**
- Create: `scripts/backfill-audit-logs.ts`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-audit-logs.ts`:

```ts
import "dotenv/config"
import { db } from "../src/db"
import { auditLogs, user } from "../src/db/schema"
import { renderAuditDescription } from "../src/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "../src/server/audit/article-numbers"
import { eq, isNull, sql } from "drizzle-orm"

async function main() {
  console.log("Backfilling audit logs...")

  // Process unrendered rows in batches. Idempotent — only rows with NULL
  // description get touched. Re-running after the NOT NULL constraint is set
  // (Task 10) is a no-op because the condition matches zero rows.
  const PAGE = 200
  let totalProcessed = 0

  while (true) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(isNull(auditLogs.description))
      .limit(PAGE)

    if (rows.length === 0) break

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const actorRow = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, row.actorUserId))
          .limit(1)
        const actorName = actorRow[0]?.name ?? "(unknown user)"

        const articleNumbers = await resolveArticleNumbersForAudit(tx, {
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          metadata: row.metadata,
        })

        // Best-effort context — we don't have shop/route names handy at
        // backfill time, so descriptions are slightly less detailed for
        // historical rows. That's acceptable.
        const description = renderAuditDescription(row.action, {
          actorName,
          recordedAt: row.createdAt,
          businessDate: row.businessDate,
        })

        await tx
          .update(auditLogs)
          .set({ description, articleNumbers })
          .where(eq(auditLogs.id, row.id))
      }
    })

    totalProcessed += rows.length
    console.log(`  processed ${totalProcessed} rows`)
  }

  // Confirm zero NULL descriptions remain.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(isNull(auditLogs.description))
  if (count > 0) {
    throw new Error(`backfill incomplete: ${count} rows still NULL`)
  }

  console.log(`Done. Total: ${totalProcessed}`)
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err)
    process.exit(1)
  })
  .then(() => process.exit(0))
```

- [ ] **Step 2: Add a package.json script**

Edit `package.json`, add to `scripts`:

```json
"backfill:audit": "dotenv -e .env.local -- tsx scripts/backfill-audit-logs.ts"
```

If `tsx` is not in `devDependencies`, run: `pnpm add -D tsx` first.

- [ ] **Step 3: Run the backfill against dev**

Run: `pnpm backfill:audit`

Expected: console prints `processed N rows`, then `Done. Total: N`. N matches the dev DB's existing audit row count.

- [ ] **Step 4: Spot-check the result**

Run: `psql "$DATABASE_URL" -c "SELECT action, description, article_numbers FROM audit_logs ORDER BY created_at DESC LIMIT 5;"`

Expected: every row has a non-empty `description` and a (possibly empty) `article_numbers` array.

- [ ] **Step 5: Re-run the script (idempotency check)**

Run: `pnpm backfill:audit`

Expected: `processed 0 rows` (or close to it — only rows still NULL get touched).

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-audit-logs.ts package.json
git commit -m "chore(audit): backfill script for description and article_numbers"
```

---

## Task 7: Backdating in the receiving server function

**Files:**
- Modify: `src/server/functions/store/receiving.ts`
- Create: `src/lib/business-date.ts`
- Create: `src/__tests__/business-date.test.ts`
- Create: `src/__tests__/receiving-backdate.test.ts`

- [ ] **Step 1: Write the business-date helper test**

Create `src/__tests__/business-date.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { isSameDayKampala, formatDayKampala } from "#/lib/business-date"

describe("isSameDayKampala", () => {
  it("treats midnight UTC and next-morning UTC as the same Kampala day if both fall on it", () => {
    // 2026-05-22 03:00 EAT = 2026-05-22 00:00 UTC
    const a = new Date("2026-05-22T00:00:00Z")
    // 2026-05-22 20:59 EAT = 2026-05-22 17:59 UTC
    const b = new Date("2026-05-22T17:59:00Z")
    expect(isSameDayKampala(a, b)).toBe(true)
  })

  it("flags midnight-UTC boundary correctly when one falls in previous Kampala day", () => {
    // 2026-05-22 02:30 EAT = 2026-05-21 23:30 UTC — falls in Kampala day 2026-05-22
    const earlyKampala = new Date("2026-05-21T23:30:00Z")
    // 2026-05-22 14:00 EAT = 2026-05-22 11:00 UTC — also Kampala day 2026-05-22
    const noonKampala = new Date("2026-05-22T11:00:00Z")
    expect(isSameDayKampala(earlyKampala, noonKampala)).toBe(true)
  })

  it("returns false for different Kampala days", () => {
    const may22 = new Date("2026-05-22T11:00:00Z")
    const may21 = new Date("2026-05-21T11:00:00Z")
    expect(isSameDayKampala(may22, may21)).toBe(false)
  })
})

describe("formatDayKampala", () => {
  it("renders YYYY-MM-DD in Africa/Kampala", () => {
    expect(formatDayKampala(new Date("2026-05-22T11:00:00Z"))).toBe("2026-05-22")
  })
})
```

- [ ] **Step 2: Run test — verify failure**

Run: `pnpm test src/__tests__/business-date.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/business-date.ts`:

```ts
const TZ = "Africa/Kampala"

export function formatDayKampala(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function isSameDayKampala(a: Date, b: Date): boolean {
  return formatDayKampala(a) === formatDayKampala(b)
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm test src/__tests__/business-date.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the integration test for backdating**

Create `src/__tests__/receiving-backdate.test.ts`. Use the same mock + `runWithStartContext` pattern as `opening-balance-variants.test.ts`. Seed: admin user, sales user, supplier, supply route with `departureDate: 2026-04-01`, one route item.

Three cases:
1. Sales user passes a past `receivedDate` → throws `/admin/i`; no `storeReceivings` row written.
2. Admin passes `receivedDate: 2026-04-10` → `storeReceivings.receivedDate`, `transactions.transactionDate`, `auditLogs.businessDate` all equal `2026-04-10`; `auditLogs.description` includes `"2026-04-10"` and the recorded date.
3. Admin passes `receivedDate: 2026-03-15` (before departure) → throws `/before goods left/i`; no rows written.

Use the existing test fixture style from `opening-balance-variants.test.ts` (the file already exists in this codebase for reference).

- [ ] **Step 6: Run test to verify failure**

Run: `pnpm test src/__tests__/receiving-backdate.test.ts`

Expected: FAIL — receivedDate not in input shape; admin check missing.

- [ ] **Step 7: Update the receiving function**

Modify `src/server/functions/store/receiving.ts`:

1. Add imports:

```ts
import { renderAuditDescription } from "#/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { getActorName } from "#/server/audit/actor"
import { isSameDayKampala, formatDayKampala } from "#/lib/business-date"
```

2. Extend the input validator:

```ts
const receiveGoodsInput = z.object({
  supplyRouteId: z.uuid(),
  items: z.array(receiveItemInput).min(1),
  receivedDate: z.coerce.date().optional(),
})
```

3. Replace the handler body. Inside `handler(async ({ data }) => { ... })`, before opening the transaction:

```ts
const session = await requireSession()
requireRole(session, ["admin"])

const store = await db.query.stores.findFirst()
if (!store) throw new Error("Store not configured")

const now = new Date()
const receivedDate = data.receivedDate ?? now

// Bounds check
if (receivedDate.getTime() > now.getTime()) {
  throw new Error("Receipt date can't be in the future.")
}

const route = await db.query.supplyRoutes.findFirst({
  where: eq(supplyRoutes.id, data.supplyRouteId),
})
if (!route) throw new Error("Supply route not found.")
if (route.departureDate) {
  // departureDate is a `date` column → a Date at UTC midnight of that day.
  const departure = new Date(route.departureDate)
  if (receivedDate.getTime() < departure.getTime()) {
    throw new Error(
      `Receipt date can't be before goods left China (${formatDayKampala(departure)}).`,
    )
  }
}

// Admin-only when the date is not today (Africa/Kampala)
if (!isSameDayKampala(receivedDate, now)) {
  if (session.user.role !== "admin") {
    throw new Error("Only admins can change the receipt date.")
  }
}
```

4. Inside the transaction, replace `receivedDate: new Date()` in the `storeReceivings` insert with `receivedDate: receivedDate`.

5. In both `postJournalEntry` calls, add `transactionDate: receivedDate,` to the params.

6. Replace the `recordAuditLog` call at the end of the transaction:

```ts
const actorName = await getActorName(tx, session.user.id)
const articleNumbers = await resolveArticleNumbersForAudit(tx, {
  action: "store.receiveGoods",
  entityType: "supply_route",
  entityId: data.supplyRouteId,
  metadata: null,
})
const businessDate = isSameDayKampala(receivedDate, now) ? null : receivedDate

await recordAuditLog(tx, {
  actorUserId: session.user.id,
  action: "store.receiveGoods",
  entityType: "supply_route",
  entityId: data.supplyRouteId,
  description: renderAuditDescription("store.receiveGoods", {
    actorName,
    routeName: route.name,
    itemCount: data.items.length,
    totalReceived,
    totalTransitLoss,
    businessDate: receivedDate,
    recordedAt: now,
  }),
  articleNumbers,
  businessDate,
  metadata: {
    itemCount: data.items.length,
    totalReceived,
    totalTransitLoss,
    receivedDate: receivedDate.toISOString(),
  },
})
```

- [ ] **Step 8: Run the test**

Run: `pnpm test src/__tests__/receiving-backdate.test.ts`

Expected: PASS (3 cases).

- [ ] **Step 9: Run full test suite**

Run: `pnpm test`

Expected: all green. Any failing test that relied on `new Date()` for `storeReceivings.receivedDate` should still pass since `receivedDate` defaults to `now`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/business-date.ts src/__tests__/business-date.test.ts src/server/functions/store/receiving.ts src/__tests__/receiving-backdate.test.ts
git commit -m "feat(store): allow admins to backdate receipts within route bounds"
```

---

## Task 8: Receiving form date picker

**Files:**
- Modify: `src/routes/store/receiving.tsx`
- Modify: `src/lib/help-dictionary.ts`

- [ ] **Step 1: Add help-dictionary entry**

In `src/lib/help-dictionary.ts`, add under the field-help section:

```ts
  "field.receivedDate": {
    description:
      "The date the goods actually arrived at the warehouse. Defaults to today. Only admins can change it.",
    example: "2026-04-10 — even if you're entering it on 2026-05-22.",
  },
```

- [ ] **Step 2: Wire the date picker**

Edit `src/routes/store/receiving.tsx`:

1. Add imports near the top:

```ts
import { FieldLabel } from "#/components/ui/field-label"
```

2. Use the existing session in the loader to get the role:

```ts
loader: async () => {
  await ensureStore()
  const [routes, prerequisites] = await Promise.all([
    listReceivableRoutes(),
    getReceivingPrereqs(),
  ])
  return { routes, prerequisites }
},
```

Add the role to the loader. Find how other admin-checked routes pass it — search: `grep -n "isAdmin\|session.user.role" src/routes/store/*.tsx src/routes/settings/*.tsx`. If the codebase already loads `session` server-side, mirror that pattern; otherwise, add a tiny `getCurrentRole` server function:

```ts
// src/server/functions/auth/role.ts
import { createServerFn } from "@tanstack/react-start"
import { requireSession } from "#/server/middleware/auth"

export const getCurrentRole = createServerFn().handler(async () => {
  const session = await requireSession()
  return { role: session.user.role }
})
```

Use that in the loader: `const { role } = await getCurrentRole()`.

3. Inside the `ReceivingPage` component, add state for the date:

```ts
const todayLocal = new Date().toLocaleDateString("en-CA") // YYYY-MM-DD in browser locale
const [receivedDateInput, setReceivedDateInput] = useState<string>(todayLocal)
```

4. Render the picker above the items table:

```tsx
<div className="max-w-sm space-y-2">
  <FieldLabel help="field.receivedDate">Received date</FieldLabel>
  <Input
    type="date"
    value={receivedDateInput}
    max={todayLocal}
    onChange={(e) => setReceivedDateInput(e.target.value)}
    disabled={role !== "admin"}
  />
  {role !== "admin" && (
    <p className="text-xs text-muted-foreground">
      Only admins can change the receipt date.
    </p>
  )}
</div>
```

5. Thread into `submitReceipt`:

```ts
await receiveGoods({
  data: {
    supplyRouteId: selectedRouteId,
    items: items.map((i) => ({
      supplyRouteItemId: i.id,
      quantityReceived: receivedQtys[i.id] ?? i.quantity,
      discrepancyNotes: (discrepancyNotes[i.id] ?? "").trim() || undefined,
    })),
    receivedDate: new Date(`${receivedDateInput}T12:00:00`), // noon local to avoid TZ edge
  },
})
```

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`

Open the receiving page as admin. Verify:
- Date input shows today.
- `max` attribute prevents picking a future date.
- Picking a date before the route's departure → error toast/message from the server.
- Sign in as sales → date input is disabled with the help text.

- [ ] **Step 4: Commit**

```bash
git add src/routes/store/receiving.tsx src/lib/help-dictionary.ts src/server/functions/auth/role.ts
git commit -m "feat(store): receiving form date picker for backdating"
```

---

## Task 9: Audit log list server functions

**Files:**
- Create: `src/server/functions/audit/list.ts`
- Create: `src/server/functions/audit/list-by-article.ts`
- Create: `src/__tests__/audit-list.test.ts`

- [ ] **Step 1: Write the test**

Create `src/__tests__/audit-list.test.ts`. Use the auth-mock pattern. Seed three audit rows:
- Row 1: actor A, action `store.receiveGoods`, articles `["X1"]`, business_date 2026-04-10, created 2026-05-22.
- Row 2: actor B, action `sale.create`, articles `["X1", "X2"]`, created 2026-05-22.
- Row 3: actor A, action `transfer.create`, articles `["X2"]`, created 2026-05-21.

Test cases:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
// ... mock + stubStartContext setup ...

import { listAuditLog } from "#/server/functions/audit/list"
import { listAuditLogByArticle } from "#/server/functions/audit/list-by-article"

describe("listAuditLog", () => {
  it("filters by article number", async () => {
    const out = await callServerFn(() => listAuditLog({ data: { articleNumber: "X1" } }))
    expect(out.rows.map((r) => r.id).sort()).toEqual([row1Id, row2Id].sort())
  })

  it("filters by actor", async () => {
    const out = await callServerFn(() => listAuditLog({ data: { actorUserId: ACTOR_A } }))
    expect(out.rows.map((r) => r.id).sort()).toEqual([row1Id, row3Id].sort())
  })

  it("filters by action", async () => {
    const out = await callServerFn(() => listAuditLog({ data: { actions: ["sale.create"] } }))
    expect(out.rows.map((r) => r.id)).toEqual([row2Id])
  })

  it("filters by date range using business_date when present", async () => {
    const out = await callServerFn(() => listAuditLog({ data: {
      from: new Date("2026-04-01"),
      to: new Date("2026-04-30"),
    }}))
    // Row 1 has business_date = 2026-04-10 → included.
    // Rows 2,3 have null business_date and created_at in May → excluded.
    expect(out.rows.map((r) => r.id)).toEqual([row1Id])
  })

  it("AND-combines multiple filters", async () => {
    const out = await callServerFn(() => listAuditLog({ data: {
      articleNumber: "X1",
      actorUserId: ACTOR_A,
    }}))
    expect(out.rows.map((r) => r.id)).toEqual([row1Id])
  })

  it("paginates with cursor", async () => {
    const first = await callServerFn(() => listAuditLog({ data: { pageSize: 2 } }))
    expect(first.rows.length).toBe(2)
    expect(first.nextCursor).toBeTruthy()
    const second = await callServerFn(() => listAuditLog({ data: { pageSize: 2, cursor: first.nextCursor } }))
    expect(second.rows.length).toBe(1)
  })
})

describe("listAuditLogByArticle", () => {
  it("returns admin + supervisor accessible rows for an article", async () => {
    const out = await callServerFn(() => listAuditLogByArticle({ data: { articleNumber: "X2" } }))
    expect(out.rows.map((r) => r.id).sort()).toEqual([row2Id, row3Id].sort())
  })
})
```

- [ ] **Step 2: Run test — verify failure**

Run: `pnpm test src/__tests__/audit-list.test.ts`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `listAuditLog`**

Create `src/server/functions/audit/list.ts`:

```ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, desc, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm"
import { db } from "#/db"
import { auditLogs, user } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const DEFAULT_PAGE = 50

const listInput = z.object({
  articleNumber: z.string().min(1).optional(),
  actorUserId: z.string().optional(),
  actions: z.array(z.string()).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
  cursor: z
    .object({
      effectiveDate: z.coerce.date(),
      id: z.string(),
    })
    .optional(),
})

export type AuditLogRow = {
  id: string
  action: string
  entityType: string
  entityId: string
  description: string
  articleNumbers: string[]
  businessDate: Date | null
  createdAt: Date
  actorUserId: string
  actorName: string | null
  before: unknown
  after: unknown
  metadata: unknown
}

export const listAuditLog = createServerFn()
  .inputValidator(listInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const pageSize = data.pageSize ?? DEFAULT_PAGE
    const conditions = []

    if (data.articleNumber) {
      conditions.push(
        sql`${auditLogs.articleNumbers} @> ARRAY[${data.articleNumber}]::text[]`,
      )
    }
    if (data.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, data.actorUserId))
    }
    if (data.actions && data.actions.length > 0) {
      conditions.push(inArray(auditLogs.action, data.actions))
    }
    if (data.from) {
      conditions.push(
        sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) >= ${data.from}`,
      )
    }
    if (data.to) {
      conditions.push(
        sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) <= ${data.to}`,
      )
    }
    if (data.cursor) {
      // Order is (effective DESC, id DESC); next page is rows strictly after the cursor.
      conditions.push(
        sql`(COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}), ${auditLogs.id}) < (${data.cursor.effectiveDate}, ${data.cursor.id})`,
      )
    }

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        description: auditLogs.description,
        articleNumbers: auditLogs.articleNumbers,
        businessDate: auditLogs.businessDate,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorName: user.name,
        before: auditLogs.before,
        after: auditLogs.after,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorUserId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) DESC`,
        desc(auditLogs.id),
      )
      .limit(pageSize + 1)

    const hasMore = rows.length > pageSize
    const sliced = hasMore ? rows.slice(0, pageSize) : rows
    const nextCursor = hasMore
      ? {
          effectiveDate: sliced[sliced.length - 1].businessDate ?? sliced[sliced.length - 1].createdAt,
          id: sliced[sliced.length - 1].id,
        }
      : null

    return { rows: sliced as AuditLogRow[], nextCursor }
  })
```

- [ ] **Step 4: Implement `listAuditLogByArticle`**

Create `src/server/functions/audit/list-by-article.ts`:

```ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "#/db"
import { auditLogs, user } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import type { AuditLogRow } from "./list"

const DEFAULT_PAGE = 50

const input = z.object({
  articleNumber: z.string().min(1),
  pageSize: z.number().int().min(1).max(200).optional(),
  cursor: z
    .object({
      effectiveDate: z.coerce.date(),
      id: z.string(),
    })
    .optional(),
})

export const listAuditLogByArticle = createServerFn()
  .inputValidator(input)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const pageSize = data.pageSize ?? DEFAULT_PAGE
    const conditions = [
      sql`${auditLogs.articleNumbers} @> ARRAY[${data.articleNumber}]::text[]`,
    ]
    if (data.cursor) {
      conditions.push(
        sql`(COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}), ${auditLogs.id}) < (${data.cursor.effectiveDate}, ${data.cursor.id})`,
      )
    }

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        description: auditLogs.description,
        articleNumbers: auditLogs.articleNumbers,
        businessDate: auditLogs.businessDate,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorName: user.name,
        before: auditLogs.before,
        after: auditLogs.after,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorUserId))
      .where(and(...conditions))
      .orderBy(
        sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) DESC`,
        desc(auditLogs.id),
      )
      .limit(pageSize + 1)

    const hasMore = rows.length > pageSize
    const sliced = hasMore ? rows.slice(0, pageSize) : rows
    const nextCursor = hasMore
      ? {
          effectiveDate: sliced[sliced.length - 1].businessDate ?? sliced[sliced.length - 1].createdAt,
          id: sliced[sliced.length - 1].id,
        }
      : null

    return { rows: sliced as AuditLogRow[], nextCursor }
  })
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/__tests__/audit-list.test.ts`

Expected: PASS (all 7 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/audit/list.ts src/server/functions/audit/list-by-article.ts src/__tests__/audit-list.test.ts
git commit -m "feat(audit): list server functions with filters and cursor pagination"
```

---

## Task 10: Tighten the description NOT NULL constraint

**Files:**
- Create: `drizzle/0008_audit_log_description_not_null.sql`

- [ ] **Step 1: Confirm backfill is complete**

Run: `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM audit_logs WHERE description IS NULL;"`

Expected: `0`.

- [ ] **Step 2: Update the schema**

In `src/db/schema/audit-logs.ts`, the `description` column already has `.notNull()`. Schema is correct; we only need an SQL migration to enforce it on the live DB.

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`

Expected: a new SQL file with `ALTER COLUMN description SET NOT NULL`. Rename to `0008_audit_log_description_not_null.sql`.

If drizzle-kit doesn't auto-generate the change (because the schema declares `.notNull()` and the live DB just doesn't enforce it), create the file by hand:

```sql
ALTER TABLE "audit_logs" ALTER COLUMN "description" SET NOT NULL;
```

And register it manually in `drizzle/meta/_journal.json` (follow the format of the existing entries).

- [ ] **Step 4: Push to all DBs**

Run: `pnpm db:push:all`

Expected: success on both dev and test DBs.

- [ ] **Step 5: Verify**

Run: `psql "$DATABASE_URL" -c "\d audit_logs"` — `description` should now show `not null`.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0008_audit_log_description_not_null.sql drizzle/meta/
git commit -m "feat(audit): tighten description column to NOT NULL"
```

---

## Task 11: Shared audit log table component

**Files:**
- Create: `src/components/audit/audit-log-table.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/audit/audit-log-table.tsx`:

```tsx
import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Button } from "#/components/ui/button"
import { InfoTip } from "#/components/ui/info-tip"
import { Badge } from "#/components/ui/badge"
import { auditActionLabel } from "#/server/audit/descriptions"
import { formatDayKampala } from "#/lib/business-date"
import type { AuditLogRow } from "#/server/functions/audit/list"

interface Props {
  rows: AuditLogRow[]
  showFilters?: boolean
  emptyMessage?: string
}

export function AuditLogTable({ rows, emptyMessage = "No recorded activity yet." }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Business date <InfoTip term="col.businessDate" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Recorded <InfoTip term="col.recordedDate" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Who <InfoTip term="col.actor" />
              </span>
            </TableHead>
            <TableHead>Action</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Activity <InfoTip term="col.activity" />
              </span>
            </TableHead>
            <TableHead aria-label="Expand" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const effective = row.businessDate ?? row.createdAt
            const isExpanded = expanded.has(row.id)
            return (
              <>
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDayKampala(effective)}
                    {row.businessDate ? null : (
                      <Badge variant="outline" className="ml-2 text-xs">recorded</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDayKampala(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.actorName ?? "(unknown)"}</TableCell>
                  <TableCell>{auditActionLabel(row.action)}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => toggle(row.id)}>
                      {isExpanded ? "Hide" : "Details"}
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${row.id}-details`}>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {JSON.stringify(
                          { before: row.before, after: row.after, metadata: row.metadata, articleNumbers: row.articleNumbers },
                          null,
                          2,
                        )}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Add help-dictionary entries**

In `src/lib/help-dictionary.ts`, add under the `col.*` section:

```ts
  "col.businessDate": {
    description:
      "When the event actually happened in the business — the date goods arrived, the sale was made, etc.",
  },
  "col.recordedDate": {
    description: "When the row was entered into the system. Equal to the business date unless someone backdated.",
  },
  "col.actor": {
    description: "The user who performed the action.",
  },
  "col.activity": {
    description: "A human-readable summary of what happened. Click 'Details' for the raw before/after data.",
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/components/audit/audit-log-table.tsx src/lib/help-dictionary.ts
git commit -m "feat(audit): shared audit-log table component"
```

---

## Task 12: Global audit log page

**Files:**
- Create: `src/routes/settings/audit-log.tsx`

- [ ] **Step 1: Implement the page**

Create `src/routes/settings/audit-log.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { FieldLabel } from "#/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { AuditLogTable } from "#/components/audit/audit-log-table"
import { listAuditLog, type AuditLogRow } from "#/server/functions/audit/list"
import { AUDIT_ACTION_LABELS } from "#/server/audit/descriptions"

export const Route = createFileRoute("/settings/audit-log")({
  beforeLoad: ({ context }) => requireUiPermission(context, "settings.auditLog"),
  loader: async () => {
    const initial = await listAuditLog({ data: { pageSize: 50 } })
    return { initial }
  },
  component: AuditLogPage,
})

function AuditLogPage() {
  const { initial } = Route.useLoaderData()
  const [rows, setRows] = useState<AuditLogRow[]>(initial.rows)
  const [cursor, setCursor] = useState<typeof initial.nextCursor>(initial.nextCursor)
  const [filters, setFilters] = useState({
    articleNumber: "",
    action: "",
    from: "",
    to: "",
  })
  const [loading, setLoading] = useState(false)

  async function applyFilters() {
    setLoading(true)
    try {
      const out = await listAuditLog({
        data: {
          articleNumber: filters.articleNumber || undefined,
          actions: filters.action ? [filters.action] : undefined,
          from: filters.from ? new Date(filters.from) : undefined,
          to: filters.to ? new Date(filters.to) : undefined,
          pageSize: 50,
        },
      })
      setRows(out.rows)
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    try {
      const out = await listAuditLog({
        data: {
          articleNumber: filters.articleNumber || undefined,
          actions: filters.action ? [filters.action] : undefined,
          from: filters.from ? new Date(filters.from) : undefined,
          to: filters.to ? new Date(filters.to) : undefined,
          pageSize: 50,
          cursor,
        },
      })
      setRows((prev) => [...prev, ...out.rows])
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground">
          Every recorded event in the system. Use filters to narrow down.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <FieldLabel help="col.filterArticle">Article number</FieldLabel>
          <Input
            value={filters.articleNumber}
            onChange={(e) => setFilters((f) => ({ ...f, articleNumber: e.target.value }))}
            placeholder="e.g. CB-1234"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterAction">Action</FieldLabel>
          <Select
            value={filters.action || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, action: v === "all" ? "" : v }))}
          >
            <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(AUDIT_ACTION_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterDateRange">From</FieldLabel>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterDateRange">To</FieldLabel>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void applyFilters()} disabled={loading}>Apply filters</Button>
        <Button variant="outline" onClick={() => { setFilters({ articleNumber: "", action: "", from: "", to: "" }); void applyFilters() }} disabled={loading}>Clear</Button>
      </div>

      <AuditLogTable rows={rows} />

      {cursor && (
        <Button variant="outline" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the permission**

Open `src/lib/permissions.ts` (search for the existing `requireUiPermission` definition). Add `settings.auditLog` to the admin-only list. If the codebase uses a map: `"settings.auditLog": ["admin"]`. If it uses a function, branch on the route key.

Run: `grep -n "settings\." src/lib/permissions.ts`

Mirror the pattern of an existing admin-only entry (e.g. `settings.users`).

- [ ] **Step 3: Add help-dictionary filter entries**

In `src/lib/help-dictionary.ts`, under `col.*`:

```ts
  "col.filterArticle": {
    description:
      "Filter to events that touched a specific product. Article number is the unique code on every product.",
    example: "CB-1234",
  },
  "col.filterAction": {
    description: "Filter to a specific kind of activity, e.g. only sales or only receipts.",
  },
  "col.filterDateRange": {
    description:
      "Filter by the business date (when the event actually happened), not when it was entered.",
  },
```

- [ ] **Step 4: Add the page to the settings nav**

Run: `grep -rn "settings/users\|Settings nav" src/components src/routes/settings 2>/dev/null | head -10`

Find the settings nav/landing card list and add an entry pointing to `/settings/audit-log` (admin-only).

- [ ] **Step 5: Smoke test**

Run: `pnpm dev`

Open `/settings/audit-log` as admin. Verify:
- All rows render.
- Article filter narrows down to matching rows.
- Action dropdown shows English names.
- Date range filter works.
- "Load more" appends rows.
- "Details" expander shows JSON.

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/audit-log.tsx src/lib/permissions.ts src/lib/help-dictionary.ts
git commit -m "feat(settings): admin audit log page with filters"
```

---

## Task 13: Per-article Activity panel on product detail

**Files:**
- Create: `src/components/audit/audit-activity-panel.tsx`
- Modify: `src/routes/products/$articleNumber.tsx`

- [ ] **Step 1: Implement the panel**

Create `src/components/audit/audit-activity-panel.tsx`:

```tsx
import { useEffect, useState } from "react"
import { Button } from "#/components/ui/button"
import { AuditLogTable } from "./audit-log-table"
import {
  listAuditLogByArticle,
} from "#/server/functions/audit/list-by-article"
import type { AuditLogRow } from "#/server/functions/audit/list"

interface Props {
  articleNumber: string
}

export function AuditActivityPanel({ articleNumber }: Props) {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [cursor, setCursor] = useState<{ effectiveDate: Date; id: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listAuditLogByArticle({ data: { articleNumber, pageSize: 25 } })
      .then((out) => {
        if (cancelled) return
        setRows(out.rows)
        setCursor(out.nextCursor)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [articleNumber])

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    try {
      const out = await listAuditLogByArticle({
        data: { articleNumber, pageSize: 25, cursor },
      })
      setRows((prev) => [...prev, ...out.rows])
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground">
          Every recorded event for this article — receipts, transfers, sales, returns.
        </p>
      </div>
      <AuditLogTable rows={rows} emptyMessage={loading ? "Loading…" : "No recorded activity for this article yet."} />
      {cursor && (
        <Button variant="outline" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Mount the panel on product detail**

Edit `src/routes/products/$articleNumber.tsx`. Find the bottom of the component (or wherever extra sections live). Conditionally render the panel for admin + supervisor:

```tsx
import { AuditActivityPanel } from "#/components/audit/audit-activity-panel"
import { useCurrentRole } from "#/lib/hooks/use-current-role" // or wherever role state lives client-side

// ...inside the component:
const role = /* get role — check existing patterns in this file or sibling routes */

// ...inside JSX, after the existing product detail content:
{(role === "admin" || role === "supervisor") && (
  <AuditActivityPanel articleNumber={articleNumber} />
)}
```

Run: `grep -rn "useCurrentRole\|session.user.role" src/routes/products 2>/dev/null` to find the existing pattern. If there's no client-side role hook, gate via a server function that returns the panel data only for allowed roles — the `listAuditLogByArticle` server function already rejects non-admin/non-supervisor calls with a thrown error, so the cleanest gate is to render the panel unconditionally and let it surface an empty state for sales (the error is caught and shown as empty).

Actually — better: skip the client-side role check, render the panel for everyone, and let the server function reject sales staff. Then catch the error in the panel:

```tsx
listAuditLogByArticle({ data: { articleNumber, pageSize: 25 } })
  .then((out) => { /* ... */ })
  .catch(() => {
    // Sales role — silently hide.
    setRows([])
    setCursor(null)
  })
```

And only show the section heading if `rows.length > 0` or loading. Adjust accordingly.

- [ ] **Step 3: Smoke test**

Run: `pnpm dev`

- As admin: open a product detail page → see the Activity panel populated.
- As supervisor: same.
- As sales: panel is hidden (or empty).

- [ ] **Step 4: Commit**

```bash
git add src/components/audit/audit-activity-panel.tsx src/routes/products/$articleNumber.tsx
git commit -m "feat(products): per-article activity panel on product detail"
```

---

## Task 14: Cypress golden path

**Files:**
- Create: `cypress/e2e/12-audit-log.cy.ts`

- [ ] **Step 1: Implement the spec**

Create `cypress/e2e/12-audit-log.cy.ts`:

```ts
/// <reference types="cypress" />

const TIMESTAMP = Date.now()
const TEST_EMAIL = `e2e-audit-${TIMESTAMP}@test.com`
const TEST_PASSWORD = "E2EPassword123!"
const ART = `AUD-${TIMESTAMP}`

describe("Backdated receipt audit log", () => {
  before(() => {
    cy.task("cleanupAllTestData", null)

    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: { name: "Audit Admin", email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    cy.task("dbQuery", `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${TEST_EMAIL}'`)

    // Seed a supply route with departure 2026-04-01, an item for ART
    cy.task("dbQuery", `INSERT INTO stores (id, name) VALUES (gen_random_uuid(), 'Main') ON CONFLICT DO NOTHING`)
    cy.task("dbQuery", `INSERT INTO suppliers (id, name) VALUES (gen_random_uuid(), 'Supplier Audit') RETURNING id`).as("supplierId")
    cy.task("dbQuery", `INSERT INTO products (id, article_number, name) VALUES (gen_random_uuid(), '${ART}', 'Audit Test Product') RETURNING id`).as("productId")

    cy.then(function () {
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task("dbQuery", `INSERT INTO product_colors (id, product_id, color_name, color_hex) VALUES (gen_random_uuid(), '${productId}', 'Black', '#000000') RETURNING id`).as("pcId")
    })

    cy.task("dbQuery", `INSERT INTO supply_routes (id, name, status, departure_date) VALUES (gen_random_uuid(), 'Audit Route', 'in_transit', '2026-04-01') RETURNING id`).as("routeId")

    cy.then(function () {
      const supplierId = (this.supplierId as Array<{ id: string }>)[0].id
      const routeId = (this.routeId as Array<{ id: string }>)[0].id
      const pcId = (this.pcId as Array<{ id: string }>)[0].id
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task("dbQuery", `
        INSERT INTO supply_route_items (id, supply_route_id, supplier_id, product_id, product_color_id, size, quantity, unit_price_foreign, total_amount_foreign, total_cost_ugx)
        VALUES (gen_random_uuid(), '${routeId}', '${supplierId}', '${productId}', '${pcId}', 'M', 10, '10', '100', '1000')
      `)
    })
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("admin backdates a receipt and sees the row on both audit views", () => {
    cy.loginAndCache(TEST_EMAIL, TEST_PASSWORD)

    cy.visit("/store/receiving")
    cy.contains("Audit Route").click()

    // Set received date to 2026-04-10
    cy.get('input[type="date"]').first().clear().type("2026-04-10")
    cy.get('input[type="number"]').first().clear().type("10")
    cy.contains("Confirm Receipt").click()

    cy.url().should("include", "/store")

    // Global audit log shows the row
    cy.visit("/settings/audit-log")
    cy.get('input[placeholder*="CB-1234"]').type(ART)
    cy.contains("Apply filters").click()
    cy.contains("Received goods").should("exist")
    cy.contains("2026-04-10").should("exist")

    // Product detail Activity panel shows the row
    cy.visit(`/products/${ART}`)
    cy.contains("Activity").should("exist")
    cy.contains("received").should("exist")
  })
})
```

- [ ] **Step 2: Run the spec**

Run: `pnpm test:e2e -- --spec "cypress/e2e/12-audit-log.cy.ts"`

Expected: PASS. If failures surface, fix them.

- [ ] **Step 3: Commit**

```bash
git add cypress/e2e/12-audit-log.cy.ts
git commit -m "test(e2e): cypress golden path for backdated receipt audit log"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: all green.

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`

Expected: no new errors (pre-existing diagnostics outside this work are not part of this task).

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: clean. Fix any new warnings (per the no-disable lint policy).

- [ ] **Step 4: Run e2e**

Run: `pnpm test:e2e`

Expected: all specs pass, including the new `12-audit-log.cy.ts`.

- [ ] **Step 5: Manual end-to-end walkthrough**

Run: `pnpm dev`

As admin:
1. Receive goods today → audit log shows row with no "recorded" badge (business = recorded).
2. Receive goods backdated 2 weeks → audit log shows row with the past date in business column and today in recorded column.
3. Receive goods before departure date → blocked with route-specific message.
4. Visit `/settings/audit-log` → filter by article → see only matching rows.
5. Visit product detail → see Activity panel.

As sales:
1. Receive form → date picker is disabled with help text.
2. `/settings/audit-log` route blocked.
3. Product detail page → Activity panel hidden.

As supervisor:
1. `/settings/audit-log` blocked.
2. Product detail Activity panel visible.

- [ ] **Step 6: Final commit if anything trailed**

If lint or typecheck surfaces tweaks, commit them as `chore(audit): final polish`.

---

## Notes for the implementer

- **No mocks of the database.** All integration tests run against the real test DB (`.env.test`). Follow the pattern in `src/__tests__/opening-balance-variants.test.ts` for auth/context stubs.
- **No `disable` lines.** If lint complains, fix the underlying code (per project rule in `feedback_no_disable_lint.md`).
- **Every InfoTip key must exist** in `src/lib/help-dictionary.ts`. The dictionary's type narrows the `term` prop, so missing keys will fail typecheck.
- **Article number filtering** uses the GIN-indexed array contains operator `@>`. Single-element ANY-of queries; if multi-value OR-of is needed in future, switch to `&&` (array overlap).
- **No backwards compatibility shims.** The migration tightens NOT NULL after backfill completes — there's no "tolerate missing description" code path.
