# docs/tasks.md Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two unfinished items in `docs/tasks.md` — X/Z shift reports and the camera/QR photo-handoff flow — and add a small mobile verification pass.

**Architecture:** Two independent vertical slices behind the same migration. (1) `shift_closures` table + `getXReport`/`closeZReport` server functions + `/reports/x` + `/reports/z` routes, all admin+supervisor only, IP-allowlist-gated, with thermal-printable HTML. (2) `picture_upload_tokens` table + 4 server functions + public `/upload-photo/$token` route + QR component in `color-editor`, using the existing S3 presign infrastructure.

**Tech Stack:** TanStack Start server functions, Drizzle ORM (Neon + node-postgres), Postgres, BigNumber.js for money math, shadcn/ui + Tailwind, Vitest + Cypress. New dep: `qrcode` (npm).

**Spec:** `docs/superpowers/specs/2026-05-13-tasks-completion-design.md` — refer to it for design rationale; this plan is execution-only.

---

## Task 1: Add `shift_closures` and `picture_upload_tokens` schema + migration

**Files:**
- Create: `src/db/schema/shift-closures.ts`
- Create: `src/db/schema/picture-upload-tokens.ts`
- Modify: `src/db/schema/index.ts` (add two exports)
- Generate: `drizzle/<timestamp>_shift_closures_and_upload_tokens.sql`

- [ ] **Step 1: Create `src/db/schema/shift-closures.ts`**

```ts
import { pgTable, uuid, text, integer, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { shops } from "./shops"

export const shiftClosures = pgTable(
  "shift_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull().references(() => shops.id, { onDelete: "restrict" }),
    closureNumber: integer("closure_number").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    closedBy: text("closed_by").notNull().references(() => user.id, { onDelete: "restrict" }),
    openingCashUgx: numeric("opening_cash_ugx", { precision: 15, scale: 2 }).notNull().default("0"),
    declaredCashUgx: numeric("declared_cash_ugx", { precision: 15, scale: 2 }).notNull(),
    expectedCashUgx: numeric("expected_cash_ugx", { precision: 15, scale: 2 }).notNull(),
    varianceUgx: numeric("variance_ugx", { precision: 15, scale: 2 }).notNull(),
    grossSalesUgx: numeric("gross_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    cashSalesUgx: numeric("cash_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    bankSalesUgx: numeric("bank_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    creditSalesUgx: numeric("credit_sales_ugx", { precision: 15, scale: 2 }).notNull(),
    salesCount: integer("sales_count").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("shift_closures_shop_number_idx").on(t.shopId, t.closureNumber),
    index("shift_closures_shop_closed_idx").on(t.shopId, t.closedAt),
  ],
)

export const shiftClosuresRelations = relations(shiftClosures, ({ one }) => ({
  shop: one(shops, { fields: [shiftClosures.shopId], references: [shops.id] }),
  closedByUser: one(user, { fields: [shiftClosures.closedBy], references: [user.id] }),
}))
```

- [ ] **Step 2: Create `src/db/schema/picture-upload-tokens.ts`**

```ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { productColors } from "./products"

export const pictureUploadTokens = pgTable(
  "picture_upload_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    productColorId: uuid("product_color_id").notNull().references(() => productColors.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    uploadedKey: text("uploaded_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("picture_upload_tokens_color_consumed_idx").on(t.productColorId, t.consumedAt)],
)

export const pictureUploadTokensRelations = relations(pictureUploadTokens, ({ one }) => ({
  productColor: one(productColors, {
    fields: [pictureUploadTokens.productColorId],
    references: [productColors.id],
  }),
}))
```

- [ ] **Step 3: Update `src/db/schema/index.ts`** — add two exports:

```ts
export * from "./shift-closures"
export * from "./picture-upload-tokens"
```

- [ ] **Step 4: Generate migration**

Run: `pnpm db:generate`
Expected: a new file in `drizzle/` with the two `CREATE TABLE` statements.

- [ ] **Step 5: Apply migration to local + test databases**

Run: `pnpm db:push:all`
Expected: tables created without errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/shift-closures.ts src/db/schema/picture-upload-tokens.ts src/db/schema/index.ts drizzle/
git commit -m "feat(db): shift_closures + picture_upload_tokens schema"
```

---

## Task 2: X/Z server functions with tests

**Files:**
- Create: `src/server/functions/accounting/shift-reports.ts`
- Create: `src/__tests__/shift-reports.test.ts`
- Modify: `src/lib/permissions.ts` (add `shift.reports.view`)

- [ ] **Step 1: Add `shift.reports.view` permission**

Modify `src/lib/permissions.ts`:
1. Add `| "shift.reports.view"` to `Permission` union.
2. Add `"shift.reports.view"` to `admin` and `supervisor` arrays in `ROLE_PERMISSIONS`.
3. Add `"shift.reports.view": ["src/server/functions/accounting/shift-reports.ts"]` to `PERMISSION_SERVER_GATES`.

- [ ] **Step 2: Write the failing test** in `src/__tests__/shift-reports.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { shopSales, shopSaleItems, shiftClosures, shops, user as userTable, products, productColors, shopStock, suppliers } from "#/db/schema"
import { sql } from "drizzle-orm"
import { computeShiftAggregates, findPeriodStart } from "#/server/functions/accounting/shift-reports"

let testShopId: string
let testUserId: string
let testStockId: string

async function cleanup() {
  await db.execute(sql`TRUNCATE shop_sale_items, shop_sales, shift_closures, shop_stock, product_colors, products, suppliers, shops, "user" CASCADE`)
}

async function seed() {
  testShopId = (await db.insert(shops).values({ name: "S", location: "L" }).returning())[0].id
  testUserId = (await db.insert(userTable).values({ id: "u1", name: "U", email: "u@t", emailVerified: true, role: "sales" }).returning())[0].id
  await db.insert(suppliers).values({ id: "s1", name: "Sup", type: "international", country: "CN" })
  const p = (await db.insert(products).values({ articleNumber: "A1", name: "T", sizes: ["M"] }).returning())[0]
  const pc = (await db.insert(productColors).values({ productId: p.id, colorName: "Red", colorHex: "#f00" }).returning())[0]
  testStockId = (await db.insert(shopStock).values({ shopId: testShopId, productColorId: pc.id, size: "M", quantityOnHand: 10, costPerUnitUgx: "10000", minimumSellPriceUgx: "20000" }).returning())[0].id
}

async function addSale(method: "cash" | "bank" | "credit", total: string) {
  const sale = (await db.insert(shopSales).values({
    shopId: testShopId, saleDate: new Date(), soldBy: testUserId, paymentMethod: method, totalAmount: total,
  }).returning())[0]
  await db.insert(shopSaleItems).values({
    shopSaleId: sale.id, shopStockId: testStockId, quantity: 1,
    unitPriceUgx: total, minimumPriceUgx: "20000", totalPriceUgx: total,
  })
  return sale
}

describe("shift-reports", () => {
  beforeEach(async () => { await cleanup(); await seed() })

  it("computeShiftAggregates sums by payment method and counts sales", async () => {
    await addSale("cash", "30000")
    await addSale("bank", "20000")
    await addSale("cash", "15000")
    const agg = await computeShiftAggregates(testShopId, new Date(0), new Date())
    expect(agg.salesCount).toBe(3)
    expect(agg.grossSalesUgx).toBe("65000.00")
    expect(agg.cashSalesUgx).toBe("45000.00")
    expect(agg.bankSalesUgx).toBe("20000.00")
    expect(agg.creditSalesUgx).toBe("0.00")
  })

  it("findPeriodStart returns epoch for first Z", async () => {
    const start = await findPeriodStart(testShopId)
    expect(start.periodStart.getTime()).toBe(0)
    expect(start.previousClosureNumber).toBe(0)
  })

  it("findPeriodStart returns the previous Z's closedAt", async () => {
    const closedAt = new Date("2026-05-01T10:00:00Z")
    await db.insert(shiftClosures).values({
      shopId: testShopId, closureNumber: 1, periodStart: new Date(0), closedAt,
      closedBy: testUserId, declaredCashUgx: "0", expectedCashUgx: "0",
      varianceUgx: "0", grossSalesUgx: "0", cashSalesUgx: "0",
      bankSalesUgx: "0", creditSalesUgx: "0", salesCount: 0,
    })
    const start = await findPeriodStart(testShopId)
    expect(start.periodStart.toISOString()).toBe(closedAt.toISOString())
    expect(start.previousClosureNumber).toBe(1)
  })
})
```

- [ ] **Step 3: Create `src/server/functions/accounting/shift-reports.ts`** with these exports:

```ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { and, desc, eq, gt, lte } from "drizzle-orm"
import { db } from "#/db"
import { shopSales, shiftClosures, user as userTable } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { makeDbIdempotencyStore } from "#/server/middleware/idempotency-store"
import { withIdempotency } from "#/server/middleware/idempotency"

export interface ShiftAggregates {
  grossSalesUgx: string
  cashSalesUgx: string
  bankSalesUgx: string
  creditSalesUgx: string
  salesCount: number
  byClerk: Array<{ userId: string; userName: string | null; totalUgx: string; count: number }>
}

export async function computeShiftAggregates(
  shopId: string, periodStart: Date, periodEnd: Date,
): Promise<ShiftAggregates> {
  const rows = await db
    .select({
      paymentMethod: shopSales.paymentMethod,
      totalAmount: shopSales.totalAmount,
      soldBy: shopSales.soldBy,
      userName: userTable.name,
    })
    .from(shopSales)
    .leftJoin(userTable, eq(shopSales.soldBy, userTable.id))
    .where(and(eq(shopSales.shopId, shopId), gt(shopSales.saleDate, periodStart), lte(shopSales.saleDate, periodEnd)))

  let cash = new BigNumber(0), bank = new BigNumber(0), credit = new BigNumber(0)
  const byClerkMap = new Map<string, { userId: string; userName: string | null; total: BigNumber; count: number }>()

  for (const r of rows) {
    const amt = new BigNumber(r.totalAmount)
    if (r.paymentMethod === "cash") cash = cash.plus(amt)
    else if (r.paymentMethod === "bank") bank = bank.plus(amt)
    else credit = credit.plus(amt)

    const existing = byClerkMap.get(r.soldBy) ?? { userId: r.soldBy, userName: r.userName, total: new BigNumber(0), count: 0 }
    existing.total = existing.total.plus(amt)
    existing.count += 1
    byClerkMap.set(r.soldBy, existing)
  }

  const gross = cash.plus(bank).plus(credit)
  return {
    grossSalesUgx: gross.toFixed(2),
    cashSalesUgx: cash.toFixed(2),
    bankSalesUgx: bank.toFixed(2),
    creditSalesUgx: credit.toFixed(2),
    salesCount: rows.length,
    byClerk: Array.from(byClerkMap.values()).map((c) => ({
      userId: c.userId, userName: c.userName, totalUgx: c.total.toFixed(2), count: c.count,
    })),
  }
}

export async function findPeriodStart(shopId: string): Promise<{ periodStart: Date; previousClosureNumber: number }> {
  const rows = await db
    .select({ closedAt: shiftClosures.closedAt, closureNumber: shiftClosures.closureNumber })
    .from(shiftClosures)
    .where(eq(shiftClosures.shopId, shopId))
    .orderBy(desc(shiftClosures.closureNumber))
    .limit(1)
  if (rows.length === 0) return { periodStart: new Date(0), previousClosureNumber: 0 }
  return { periodStart: rows[0].closedAt, previousClosureNumber: rows[0].closureNumber }
}

export const getXReport = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { periodStart, previousClosureNumber } = await findPeriodStart(data.shopId)
    const asOf = new Date()
    const aggregates = await computeShiftAggregates(data.shopId, periodStart, asOf)
    return { shopId: data.shopId, periodStart, asOf, previousClosureNumber, ...aggregates }
  })

export const closeZReport = createServerFn()
  .inputValidator(z.object({
    shopId: z.string().uuid(),
    declaredCashUgx: z.string(),
    notes: z.string().optional(),
    idempotencyKey: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const store = makeDbIdempotencyStore(db)

    return withIdempotency(store, data.idempotencyKey, async () => {
      const closedAt = new Date()
      const { periodStart, previousClosureNumber } = await findPeriodStart(data.shopId)
      const agg = await computeShiftAggregates(data.shopId, periodStart, closedAt)
      const expectedCash = new BigNumber(agg.cashSalesUgx)
      const variance = new BigNumber(data.declaredCashUgx).minus(expectedCash)
      const [row] = await db.insert(shiftClosures).values({
        shopId: data.shopId,
        closureNumber: previousClosureNumber + 1,
        periodStart,
        closedAt,
        closedBy: userId,
        openingCashUgx: "0",
        declaredCashUgx: data.declaredCashUgx,
        expectedCashUgx: expectedCash.toFixed(2),
        varianceUgx: variance.toFixed(2),
        grossSalesUgx: agg.grossSalesUgx,
        cashSalesUgx: agg.cashSalesUgx,
        bankSalesUgx: agg.bankSalesUgx,
        creditSalesUgx: agg.creditSalesUgx,
        salesCount: agg.salesCount,
        notes: data.notes ?? null,
      }).returning()
      return row
    })
  })

export const getZReportHistory = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid(), limit: z.number().int().positive().max(50).default(10) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    return db
      .select()
      .from(shiftClosures)
      .where(eq(shiftClosures.shopId, data.shopId))
      .orderBy(desc(shiftClosures.closureNumber))
      .limit(data.limit)
  })

export const getZReportById = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const closure = await db.query.shiftClosures.findFirst({
      where: eq(shiftClosures.id, data.id),
      with: { shop: true, closedByUser: { columns: { id: true, name: true } } },
    })
    if (!closure) throw new Error(`Shift closure not found: ${data.id}`)
    const byClerk = (await computeShiftAggregates(closure.shopId, closure.periodStart, closure.closedAt)).byClerk
    return { ...closure, byClerk }
  })
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/__tests__/shift-reports.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Run the full permissions test**

Run: `pnpm test src/__tests__/permissions.test.ts`
Expected: pass, with `shift.reports.view` recognized.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/accounting/shift-reports.ts src/__tests__/shift-reports.test.ts src/lib/permissions.ts
git commit -m "feat(reports): X/Z shift report server functions"
```

---

## Task 3: Shift closure thermal-printable HTML + browser printer helper

**Files:**
- Create: `src/lib/pdf/shift-closure-html.ts`
- Create: `src/lib/pos/print-shift-closure.ts` (mirrors `print-receipt.ts` — uses Blob URL, NOT `document.write`)
- Create: `src/__tests__/shift-closure-html.test.ts`

- [ ] **Step 1: Write the failing test** in `src/__tests__/shift-closure-html.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { renderShiftClosure } from "#/lib/pdf/shift-closure-html"

const closure = {
  closureNumber: 7,
  shopName: "Kampala Main",
  closedByName: "Aisha",
  periodStart: new Date("2026-05-13T06:00:00Z"),
  closedAt: new Date("2026-05-13T19:00:00Z"),
  grossSalesUgx: "1450000",
  cashSalesUgx: "900000",
  bankSalesUgx: "400000",
  creditSalesUgx: "150000",
  declaredCashUgx: "895000",
  expectedCashUgx: "900000",
  varianceUgx: "-5000",
  salesCount: 23,
  byClerk: [
    { userId: "u1", userName: "Aisha", totalUgx: "1000000", count: 15 },
    { userId: "u2", userName: "Brian", totalUgx: "450000", count: 8 },
  ],
}

describe("renderShiftClosure", () => {
  it("includes the closure number, shop and totals", () => {
    const html = renderShiftClosure(closure)
    expect(html).toContain("Z #7")
    expect(html).toContain("Kampala Main")
    expect(html).toContain("Aisha")
    expect(html).toContain("1,450,000")
    expect(html).toContain("-5,000")
  })
  it("escapes user-supplied names", () => {
    const html = renderShiftClosure({ ...closure, shopName: "<script>x</script>" })
    expect(html).not.toContain("<script>x</script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
```

- [ ] **Step 2: Run the test (expect failure)**

Run: `pnpm test src/__tests__/shift-closure-html.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/pdf/shift-closure-html.ts`

```ts
import { formatUgx } from "#/lib/format"

interface ClerkRow { userId: string; userName: string | null; totalUgx: string; count: number }
interface ShiftClosureForPrint {
  closureNumber: number
  shopName: string
  closedByName: string | null
  periodStart: Date
  closedAt: Date
  grossSalesUgx: string
  cashSalesUgx: string
  bankSalesUgx: string
  creditSalesUgx: string
  declaredCashUgx: string
  expectedCashUgx: string
  varianceUgx: string
  salesCount: number
  byClerk: ClerkRow[]
}

export function renderShiftClosure(c: ShiftClosureForPrint): string {
  const fmt = (d: Date) => d.toLocaleString("en-UG", { timeZone: "Africa/Kampala" })
  const clerkRows = c.byClerk.map((r) => `
        <tr>
          <td>${escapeHtml(r.userName ?? r.userId)}</td>
          <td class="num">${r.count}</td>
          <td class="num">${formatUgx(r.totalUgx)}</td>
        </tr>`).join("")
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Z #${c.closureNumber}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;color:#111;max-width:720px;}
  h1{font-size:18px;margin:0 0 12px 0;}
  .meta{font-size:12px;color:#444;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;}
  th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;}
  .toolbar{margin-top:24px;display:flex;gap:8px;}
  .toolbar button{padding:8px 14px;cursor:pointer;}
  @media print{
    @page{size:80mm auto;margin:0;}
    body{margin:0;padding:4mm;width:72mm;font-family:ui-monospace,monospace;font-size:11px;color:#000;}
    h1{font-size:13px;margin:0 0 4px 0;text-align:center;}
    .meta{margin-bottom:6px;font-size:10px;}
    table{font-size:10px;}
    th,td{padding:2px 0;border:0;border-bottom:1px dashed #888;}
    .toolbar{display:none;}
  }
</style></head><body>
  <h1>${escapeHtml(c.shopName)} — Z #${c.closureNumber}</h1>
  <div class="meta">
    <div><strong>Period:</strong> ${fmt(c.periodStart)} → ${fmt(c.closedAt)}</div>
    <div><strong>Closed by:</strong> ${escapeHtml(c.closedByName ?? "—")}</div>
    <div><strong>Sales count:</strong> ${c.salesCount}</div>
  </div>
  <table><thead><tr><th>By method</th><th class="num">Amount</th></tr></thead><tbody>
    <tr><td>Cash</td><td class="num">${formatUgx(c.cashSalesUgx)}</td></tr>
    <tr><td>Bank</td><td class="num">${formatUgx(c.bankSalesUgx)}</td></tr>
    <tr><td>Credit</td><td class="num">${formatUgx(c.creditSalesUgx)}</td></tr>
    <tr><td><strong>Gross</strong></td><td class="num"><strong>${formatUgx(c.grossSalesUgx)}</strong></td></tr>
  </tbody></table>
  <table style="margin-top:12px"><thead><tr><th>Cash drawer</th><th class="num">Amount</th></tr></thead><tbody>
    <tr><td>Expected</td><td class="num">${formatUgx(c.expectedCashUgx)}</td></tr>
    <tr><td>Declared</td><td class="num">${formatUgx(c.declaredCashUgx)}</td></tr>
    <tr><td><strong>Variance</strong></td><td class="num"><strong>${formatUgx(c.varianceUgx)}</strong></td></tr>
  </tbody></table>
  <table style="margin-top:12px"><thead><tr><th>Clerk</th><th class="num">Sales</th><th class="num">Total</th></tr></thead><tbody>${clerkRows}</tbody></table>
  <div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!))
}
```

- [ ] **Step 4: Implement `src/lib/pos/print-shift-closure.ts`** — mirrors the existing receipt printer:

```ts
/**
 * Open a printable Z report in a new window.
 *
 * Uses a Blob URL (not document.write) to stay aligned with the existing
 * print-receipt helper. The HTML body comes from renderShiftClosure which
 * already escapes interpolated values.
 *
 * Callers must invoke this from a user gesture (button click) — popup
 * blockers reject window.open otherwise.
 */
export function openShiftClosurePrintWindow(html: string): void {
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, "_blank", "width=400,height=640")
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error("Couldn't open the Z report window — allow pop-ups for this site and try again.")
  }
  win.addEventListener("load", () => {
    try { win.focus(); win.print() } catch { /* template has its own Print button */ }
    win.addEventListener("beforeunload", () => URL.revokeObjectURL(url))
  })
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/__tests__/shift-closure-html.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/shift-closure-html.ts src/lib/pos/print-shift-closure.ts src/__tests__/shift-closure-html.test.ts
git commit -m "feat(reports): thermal-printable shift closure HTML + printer helper"
```

---

## Task 4: X/Z routes, components, sidebar

**Files:**
- Create: `src/routes/reports/x.tsx`
- Create: `src/routes/reports/z.tsx`
- Create: `src/routes/reports/z.$id.tsx`
- Create: `src/components/reports/shop-picker.tsx`
- Create: `src/components/reports/x-report-view.tsx`
- Create: `src/components/reports/z-close-dialog.tsx`
- Create: `src/components/reports/z-history-table.tsx`
- Modify: `src/components/app-sidebar.tsx` (add X and Z entries under Finance)
- Create: `src/server/functions/shop/list-shops.ts` — `listShopsForReports` returning `[{id, name}]` filtered by user role

- [ ] **Step 1: Check whether a "list shops" server fn already exists**

Run: `grep -rn "from .#/db/schema..shops" src/server/functions | grep -i list`
If one exists, reuse it. Otherwise create `src/server/functions/shop/list-shops.ts`:

```ts
import { createServerFn } from "@tanstack/react-start"
import { db } from "#/db"
import { shops } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listShopsForReports = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])
  const user = session.user as { role?: string; shopId?: string | null }
  const all = await db.select({ id: shops.id, name: shops.name }).from(shops)
  if (user.role === "supervisor" && user.shopId) {
    return all.filter((s) => s.id === user.shopId)
  }
  return all
})
```

- [ ] **Step 2: Build `src/components/reports/shop-picker.tsx`**

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"

interface Props {
  shops: Array<{ id: string; name: string }>
  value: string
  onChange: (id: string) => void
}
export function ShopPicker({ shops, value, onChange }: Props) {
  if (shops.length <= 1) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick shop" /></SelectTrigger>
      <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
    </Select>
  )
}
```

- [ ] **Step 3: Build `src/components/reports/x-report-view.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { ResponsiveTable } from "#/components/ui/responsive-table"
import { formatUgxTotal } from "#/lib/format"

interface Row { userId: string; userName: string | null; totalUgx: string; count: number }
interface Props {
  gross: string; cash: string; bank: string; credit: string; salesCount: number
  byClerk: Row[]; asOf: Date; periodStart: Date; previousClosureNumber: number
}
export function XReportView(p: Props) {
  const kpis: Array<[string, string]> = [
    ["Gross", formatUgxTotal(p.gross)], ["Cash", formatUgxTotal(p.cash)],
    ["Bank", formatUgxTotal(p.bank)], ["Credit", formatUgxTotal(p.credit)],
  ]
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Since {p.periodStart.getTime() === 0 ? "the beginning" : `Z #${p.previousClosureNumber} (${p.periodStart.toLocaleString("en-UG")})`} · {p.salesCount} sale(s)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold font-mono">{value}</div></CardContent>
          </Card>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">By clerk</h3>
        <div className="rounded-md border">
          <ResponsiveTable data={p.byClerk} getRowKey={(r) => r.userId} columns={[
            { header: "Clerk", cell: (r) => r.userName ?? r.userId },
            { header: "Sales", align: "right", cell: (r) => r.count },
            { header: "Total", align: "right", cell: (r) => <span className="font-mono">{formatUgxTotal(r.totalUgx)}</span> },
          ]} emptyMessage="No sales yet."/>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Build `src/components/reports/z-close-dialog.tsx`**

```tsx
import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { formatUgxTotal } from "#/lib/format"
import { closeZReport } from "#/server/functions/accounting/shift-reports"
import BigNumber from "bignumber.js"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  shopId: string
  expectedCashUgx: string
}
export function ZCloseDialog({ open, onOpenChange, shopId, expectedCashUgx }: Props) {
  const [declared, setDeclared] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [idemKey] = React.useState(() => crypto.randomUUID())
  const router = useRouter()
  const expected = new BigNumber(expectedCashUgx)
  const variance = declared === "" ? null : new BigNumber(declared).minus(expected)

  const close = useMutation({
    mutationFn: () => closeZReport({ data: { shopId, declaredCashUgx: declared, notes, idempotencyKey: idemKey } }),
    onSuccess: (row) => {
      onOpenChange(false)
      window.open(`/reports/z/${row.id}?print=1`, "_blank")
      void router.invalidate()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Close shift</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between"><span>Expected cash</span><span className="font-mono">{formatUgxTotal(expectedCashUgx)}</span></div>
          <div className="space-y-1.5">
            <Label htmlFor="declared">Declared cash (count the drawer)</Label>
            <Input id="declared" inputMode="numeric" value={declared} onChange={(e) => setDeclared(e.target.value)} />
          </div>
          {variance && (
            <div className="flex justify-between text-sm"><span>Variance</span>
              <span className={`font-mono ${variance.isZero() ? "" : variance.isNegative() ? "text-red-600" : "text-amber-600"}`}>{formatUgxTotal(variance.toFixed(2))}</span></div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={declared === "" || close.isPending} onClick={() => close.mutate()}>{close.isPending ? "Closing…" : "Close shift"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Build `src/components/reports/z-history-table.tsx`**

```tsx
import { Link } from "@tanstack/react-router"
import { ResponsiveTable } from "#/components/ui/responsive-table"
import { formatUgxTotal } from "#/lib/format"

interface Row {
  id: string; closureNumber: number; closedAt: Date | string
  grossSalesUgx: string; varianceUgx: string
}
export function ZHistoryTable({ rows }: { rows: Row[] }) {
  return (
    <ResponsiveTable data={rows} getRowKey={(r) => r.id} columns={[
      { header: "#", cell: (r) => <Link className="underline" to="/reports/z/$id" params={{ id: r.id }}>Z #{r.closureNumber}</Link> },
      { header: "Closed", cell: (r) => new Date(r.closedAt).toLocaleString("en-UG") },
      { header: "Gross", align: "right", cell: (r) => <span className="font-mono">{formatUgxTotal(r.grossSalesUgx)}</span> },
      { header: "Variance", align: "right", cell: (r) => <span className="font-mono">{formatUgxTotal(r.varianceUgx)}</span> },
    ]} emptyMessage="No closures yet."/>
  )
}
```

- [ ] **Step 6: Create `src/routes/reports/x.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { requireUiPermission } from "#/lib/permissions"
import { listShopsForReports } from "#/server/functions/shop/list-shops"
import { getXReport } from "#/server/functions/accounting/shift-reports"
import { ShopPicker } from "#/components/reports/shop-picker"
import { XReportView } from "#/components/reports/x-report-view"
import { Button } from "#/components/ui/button"
import { ZCloseDialog } from "#/components/reports/z-close-dialog"

export const Route = createFileRoute("/reports/x")({
  beforeLoad: ({ context }) => requireUiPermission(context, "shift.reports.view"),
  loader: async () => {
    const shops = await listShopsForReports()
    if (shops.length === 0) return { shops, report: null, shopId: null as string | null }
    const shopId = shops[0].id
    const report = await getXReport({ data: { shopId } })
    return { shops, report, shopId }
  },
  component: XReportPage,
})

function XReportPage() {
  const initial = Route.useLoaderData()
  const [shopId, setShopId] = React.useState(initial.shopId)
  const [report, setReport] = React.useState(initial.report)
  const [closeOpen, setCloseOpen] = React.useState(false)

  async function pickShop(id: string) {
    setShopId(id)
    const r = await getXReport({ data: { shopId: id } })
    setReport(r)
  }

  if (!shopId || !report) return <div className="text-muted-foreground">No shop available.</div>
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">X Report</h1>
          <ShopPicker shops={initial.shops} value={shopId} onChange={(id) => void pickShop(id)} />
        </div>
        <Button onClick={() => setCloseOpen(true)}>Close shift (Z)</Button>
      </div>
      <XReportView gross={report.grossSalesUgx} cash={report.cashSalesUgx} bank={report.bankSalesUgx}
        credit={report.creditSalesUgx} salesCount={report.salesCount} byClerk={report.byClerk}
        asOf={new Date(report.asOf)} periodStart={new Date(report.periodStart)} previousClosureNumber={report.previousClosureNumber} />
      <ZCloseDialog open={closeOpen} onOpenChange={setCloseOpen} shopId={shopId} expectedCashUgx={report.cashSalesUgx} />
    </div>
  )
}
```

- [ ] **Step 7: Create `src/routes/reports/z.tsx`**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import { listShopsForReports } from "#/server/functions/shop/list-shops"
import { getZReportHistory } from "#/server/functions/accounting/shift-reports"
import { ZHistoryTable } from "#/components/reports/z-history-table"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/reports/z/")({
  beforeLoad: ({ context }) => requireUiPermission(context, "shift.reports.view"),
  loader: async () => {
    const shops = await listShopsForReports()
    if (shops.length === 0) return { shops, history: [] as Awaited<ReturnType<typeof getZReportHistory>> }
    const history = await getZReportHistory({ data: { shopId: shops[0].id, limit: 10 } })
    return { shops, history }
  },
  component: ZIndexPage,
})

function ZIndexPage() {
  const { history } = Route.useLoaderData()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Z Reports</h1>
        <Button asChild><Link to="/reports/x">Open current shift (X)</Link></Button>
      </div>
      <ZHistoryTable rows={history.map((h) => ({ ...h, closedAt: new Date(h.closedAt) }))} />
    </div>
  )
}
```

- [ ] **Step 8: Create `src/routes/reports/z.$id.tsx`** — detail view with print-on-load when `?print=1`:

```tsx
import { createFileRoute, useSearch } from "@tanstack/react-router"
import * as React from "react"
import { z } from "zod"
import { requireUiPermission } from "#/lib/permissions"
import { getZReportById } from "#/server/functions/accounting/shift-reports"
import { renderShiftClosure } from "#/lib/pdf/shift-closure-html"
import { openShiftClosurePrintWindow } from "#/lib/pos/print-shift-closure"
import { XReportView } from "#/components/reports/x-report-view"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/reports/z/$id")({
  beforeLoad: ({ context }) => requireUiPermission(context, "shift.reports.view"),
  validateSearch: z.object({ print: z.string().optional() }),
  loader: async ({ params }) => getZReportById({ data: { id: params.id } }),
  component: ZDetailPage,
})

function ZDetailPage() {
  const closure = Route.useLoaderData()
  const search = useSearch({ from: "/reports/z/$id" })

  function openPrint() {
    const html = renderShiftClosure({
      closureNumber: closure.closureNumber,
      shopName: closure.shop.name,
      closedByName: closure.closedByUser?.name ?? null,
      periodStart: new Date(closure.periodStart),
      closedAt: new Date(closure.closedAt),
      grossSalesUgx: closure.grossSalesUgx, cashSalesUgx: closure.cashSalesUgx,
      bankSalesUgx: closure.bankSalesUgx, creditSalesUgx: closure.creditSalesUgx,
      declaredCashUgx: closure.declaredCashUgx, expectedCashUgx: closure.expectedCashUgx,
      varianceUgx: closure.varianceUgx, salesCount: closure.salesCount,
      byClerk: closure.byClerk,
    })
    openShiftClosurePrintWindow(html)
  }

  React.useEffect(() => { if (search.print === "1") openPrint() }, [search.print])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Z #{closure.closureNumber} — {closure.shop.name}</h1>
        <Button onClick={openPrint}>Print</Button>
      </div>
      <XReportView gross={closure.grossSalesUgx} cash={closure.cashSalesUgx} bank={closure.bankSalesUgx}
        credit={closure.creditSalesUgx} salesCount={closure.salesCount} byClerk={closure.byClerk}
        asOf={new Date(closure.closedAt)} periodStart={new Date(closure.periodStart)} previousClosureNumber={closure.closureNumber - 1} />
    </div>
  )
}
```

- [ ] **Step 9: Add sidebar entries**

Modify `src/components/app-sidebar.tsx` Finance group; add after the existing "Reports" entry:

```ts
{ label: "X Report", to: "/reports/x", icon: ClipboardList, permission: "shift.reports.view" },
{ label: "Z Reports", to: "/reports/z", icon: Receipt, permission: "shift.reports.view" },
```

- [ ] **Step 10: Manual smoke test**

Run: `pnpm dev`, log in as admin, visit `/reports/x`, verify totals, click Close shift, enter declared cash, confirm — observe print window opens, `/reports/z` shows the new closure, click into detail — looks right.

- [ ] **Step 11: Commit**

```bash
git add src/routes/reports/x.tsx src/routes/reports/z.tsx src/routes/reports/z.$id.tsx src/components/reports src/components/app-sidebar.tsx src/server/functions/shop/list-shops.ts
git commit -m "feat(reports): X/Z report routes, components, sidebar entries"
```

---

## Task 5: Mobile camera capture attribute (one-line change)

**Files:**
- Modify: `src/components/products/image-uploader.tsx`

- [ ] **Step 1: Add `capture="environment"` to the file input**

Find the `<input type="file" accept="image/*" …>` and add `capture="environment"`:

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  capture="environment"
  className="hidden"
  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/products/image-uploader.tsx
git commit -m "feat(products): mobile camera capture hint on image upload"
```

---

## Task 6: Desktop QR photo handoff

**Files:**
- Install: `qrcode` + `@types/qrcode`
- Create: `src/server/functions/products/photo-handoff.ts`
- Create: `src/routes/upload-photo.$token.tsx`
- Create: `src/components/products/photo-handoff-qr.tsx`
- Modify: `src/components/products/color-editor.tsx` (mount QR component)
- Create: `src/__tests__/photo-handoff.test.ts`

- [ ] **Step 1: Install dependencies**

Run: `pnpm add qrcode && pnpm add -D @types/qrcode`

- [ ] **Step 2: Write the failing test** in `src/__tests__/photo-handoff.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { sql, isNull } from "drizzle-orm"
import { db } from "#/db"
import { pictureUploadTokens, products, productColors, user as userTable } from "#/db/schema"
import { _internal } from "#/server/functions/products/photo-handoff"

async function reset() {
  await db.execute(sql`TRUNCATE picture_upload_tokens, product_colors, products, "user" CASCADE`)
}
async function seed() {
  await db.insert(userTable).values({ id: "u1", name: "U", email: "u@t", emailVerified: true, role: "admin" })
  const p = (await db.insert(products).values({ articleNumber: "A1", name: "T", sizes: ["M"] }).returning())[0]
  return (await db.insert(productColors).values({ productId: p.id, colorName: "Red", colorHex: "#f00" }).returning())[0]
}

describe("photo-handoff internals", () => {
  beforeEach(async () => { await reset() })

  it("validateToken rejects expired tokens", async () => {
    const pc = await seed()
    await db.insert(pictureUploadTokens).values({
      token: "tok-old", productColorId: pc.id, createdBy: "u1",
      expiresAt: new Date(Date.now() - 60_000),
    })
    await expect(_internal.validateToken("tok-old")).rejects.toThrow(/expired/i)
  })

  it("validateToken rejects consumed tokens", async () => {
    const pc = await seed()
    await db.insert(pictureUploadTokens).values({
      token: "tok-used", productColorId: pc.id, createdBy: "u1",
      expiresAt: new Date(Date.now() + 60_000), consumedAt: new Date(),
    })
    await expect(_internal.validateToken("tok-used")).rejects.toThrow(/already used/i)
  })

  it("markConsumed sets consumedAt and image key on productColors", async () => {
    const pc = await seed()
    await db.insert(pictureUploadTokens).values({
      token: "tok-good", productColorId: pc.id, createdBy: "u1",
      expiresAt: new Date(Date.now() + 60_000),
    })
    await _internal.markConsumed("tok-good", `products/${pc.productId}/${pc.id}.jpg`)
    const t = await db.query.pictureUploadTokens.findFirst({ where: (x, { eq }) => eq(x.token, "tok-good") })
    expect(t?.consumedAt).toBeTruthy()
    expect(t?.uploadedKey).toBe(`products/${pc.productId}/${pc.id}.jpg`)
    const updated = await db.query.productColors.findFirst({ where: (x, { eq }) => eq(x.id, pc.id) })
    expect(updated?.imageS3Key).toBe(`products/${pc.productId}/${pc.id}.jpg`)
  })
})
```

- [ ] **Step 3: Implement `src/server/functions/products/photo-handoff.ts`**

```ts
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, eq, isNull } from "drizzle-orm"
import crypto from "node:crypto"
import { db } from "#/db"
import { pictureUploadTokens, productColors } from "#/db/schema"
import { presignPutUrl, publicUrlFor } from "#/lib/s3/sign"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { env } from "#/env"

const TOKEN_TTL_MS = 15 * 60 * 1000

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

async function validateToken(token: string) {
  const row = await db.query.pictureUploadTokens.findFirst({
    where: eq(pictureUploadTokens.token, token),
    with: { productColor: { with: { product: true } } },
  })
  if (!row) throw new Error("Token not found")
  if (row.consumedAt) throw new Error("Token already used")
  if (row.expiresAt.getTime() < Date.now()) throw new Error("Token expired")
  return row
}

async function markConsumed(token: string, s3Key: string) {
  await db.transaction(async (tx) => {
    const updated = await tx.update(pictureUploadTokens)
      .set({ consumedAt: new Date(), uploadedKey: s3Key })
      .where(and(eq(pictureUploadTokens.token, token), isNull(pictureUploadTokens.consumedAt)))
      .returning()
    if (updated.length === 0) throw new Error("Token already consumed or missing")
    await tx.update(productColors).set({ imageS3Key: s3Key }).where(eq(productColors.id, updated[0].productColorId))
  })
}

export const _internal = { validateToken, markConsumed }

export const createPhotoUploadToken = createServerFn()
  .inputValidator(z.object({ productColorId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const token = generateToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await db.insert(pictureUploadTokens).values({
      token, productColorId: data.productColorId, createdBy: userId, expiresAt,
    })
    return { token, url: `${env.APP_URL}/upload-photo/${token}`, expiresAt }
  })

export const getPhotoUploadStatus = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await db.query.pictureUploadTokens.findFirst({
      where: eq(pictureUploadTokens.token, data.token),
    })
    if (!row) return { status: "missing" as const, uploadedKey: null }
    if (row.consumedAt) return { status: "consumed" as const, uploadedKey: row.uploadedKey, imageUrl: row.uploadedKey ? publicUrlFor(row.uploadedKey) : null }
    if (row.expiresAt.getTime() < Date.now()) return { status: "expired" as const, uploadedKey: null }
    return { status: "pending" as const, uploadedKey: null }
  })

export const redeemPhotoUploadToken = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1), contentType: z.string().regex(/^image\//) }))
  .handler(async ({ data }) => {
    const row = await validateToken(data.token)
    const key = `products/${row.productColor.product.id}/${row.productColor.id}.jpg`
    const uploadUrl = await presignPutUrl({ key, contentType: data.contentType })
    return { uploadUrl, s3Key: key }
  })

export const confirmPhotoUpload = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await validateToken(data.token)
    const key = `products/${row.productColor.product.id}/${row.productColor.id}.jpg`
    await markConsumed(data.token, key)
    return { imageUrl: publicUrlFor(key) }
  })
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/__tests__/photo-handoff.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Implement `src/routes/upload-photo.$token.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { redeemPhotoUploadToken, confirmPhotoUpload } from "#/server/functions/products/photo-handoff"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/upload-photo/$token")({
  loader: ({ params }) => ({ token: params.token }),
  component: UploadPhotoPage,
})

function UploadPhotoPage() {
  const { token } = Route.useLoaderData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<"idle" | "uploading" | "done" | "error">("idle")
  const [error, setError] = React.useState<string | null>(null)

  async function onFile(file: File) {
    setState("uploading"); setError(null)
    try {
      const { uploadUrl } = await redeemPhotoUploadToken({ data: { token, contentType: file.type } })
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await confirmPhotoUpload({ data: { token } })
      setState("done")
    } catch (e) {
      setState("error"); setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-bold">Take a product photo</h1>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}/>
        {state === "idle" && <Button onClick={() => inputRef.current?.click()}>Take photo</Button>}
        {state === "uploading" && <div className="text-muted-foreground">Uploading…</div>}
        {state === "done" && <div className="text-green-700">Done — return to your computer.</div>}
        {state === "error" && (
          <div className="space-y-2">
            <div className="text-red-600 text-sm">{error}</div>
            <Button variant="outline" onClick={() => inputRef.current?.click()}>Try again</Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Build `src/components/products/photo-handoff-qr.tsx`**

```tsx
import * as React from "react"
import QRCode from "qrcode"
import { Button } from "#/components/ui/button"
import { createPhotoUploadToken, getPhotoUploadStatus } from "#/server/functions/products/photo-handoff"

interface Props {
  productColorId: string
  onUploaded: (imageUrl: string) => void
}
export function PhotoHandoffQR({ productColorId, onUploaded }: Props) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null)
  const [now, setNow] = React.useState(Date.now())

  async function generate() {
    const { token: t, url, expiresAt: exp } = await createPhotoUploadToken({ data: { productColorId } })
    const png = await QRCode.toDataURL(url, { width: 256, margin: 1 })
    setDataUrl(png); setToken(t); setExpiresAt(new Date(exp))
  }

  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  React.useEffect(() => {
    if (!token) return
    const id = setInterval(async () => {
      const status = await getPhotoUploadStatus({ data: { token } })
      if (status.status === "consumed" && status.imageUrl) {
        clearInterval(id); onUploaded(status.imageUrl)
        setDataUrl(null); setToken(null)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [token, onUploaded])

  const expired = expiresAt && expiresAt.getTime() < now
  const secondsLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000)) : 0

  if (!dataUrl) return <Button type="button" variant="outline" onClick={() => void generate()}>Take with phone (QR)</Button>
  return (
    <div className="space-y-2 text-center">
      <img src={dataUrl} alt="Scan with phone" className="mx-auto rounded border" width={256} height={256} />
      <div className="text-xs text-muted-foreground">
        {expired ? "Expired" : `Scan with your phone · expires in ${Math.floor(secondsLeft/60)}:${(secondsLeft%60).toString().padStart(2,"0")}`}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void generate()}>Regenerate</Button>
    </div>
  )
}
```

- [ ] **Step 7: Mount in `src/components/products/color-editor.tsx`**

Read the current file (it imports `ImageUploader`). Add `PhotoHandoffQR` next to the `ImageUploader` and wire `onUploaded` to either `router.invalidate()` or whatever callback `ImageUploader.onBlobReady` currently uses to mark the color dirty / refresh. Keep changes additive.

- [ ] **Step 8: Manual smoke test**

Run: `pnpm dev`. Open a product, generate a QR, scan with phone (must be on same LAN or have `APP_URL` reachable from phone), upload a photo, verify desktop refreshes within ~2s.

- [ ] **Step 9: Commit**

```bash
git add src/server/functions/products/photo-handoff.ts src/routes/upload-photo.$token.tsx src/components/products/photo-handoff-qr.tsx src/components/products/color-editor.tsx src/__tests__/photo-handoff.test.ts package.json pnpm-lock.yaml
git commit -m "feat(products): QR-handoff photo upload from phone to desktop"
```

---

## Task 7: Cypress tests

**Files:**
- Create: `cypress/e2e/10-shift-reports.cy.ts`
- Modify: `cypress/e2e/09-mobile-admin-screens.cy.ts` (add X/Z viewport checks)

- [ ] **Step 1: Write `cypress/e2e/10-shift-reports.cy.ts`**

```ts
describe("X/Z shift reports", () => {
  const admin = `e2e-zreport-${Date.now()}@test.com`
  const password = "E2EPassword123!"

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.signup("Z Admin", admin, password)
    cy.task("dbQuery", `UPDATE "user" SET role='admin', email_verified=TRUE WHERE email='${admin}'`)
    cy.task("dbQuery", `INSERT INTO shops (name, location) VALUES ('Z Shop', 'Kampala') ON CONFLICT DO NOTHING`)
    cy.task("dbQuery", `
      INSERT INTO shop_sales (shop_id, sale_date, sold_by, payment_method, total_amount, payment_status, outstanding_balance)
      SELECT (SELECT id FROM shops WHERE name='Z Shop'), NOW(), (SELECT id FROM "user" WHERE email='${admin}'),
             'cash'::payment_method, '50000', 'settled'::payment_status, '0'
    `)
    cy.task("dbQuery", `
      INSERT INTO shop_sales (shop_id, sale_date, sold_by, payment_method, total_amount, payment_status, outstanding_balance)
      SELECT (SELECT id FROM shops WHERE name='Z Shop'), NOW(), (SELECT id FROM "user" WHERE email='${admin}'),
             'bank'::payment_method, '20000', 'settled'::payment_status, '0'
    `)
  })

  after(() => cy.task("cleanupAllTestData", null))

  it("X report shows totals, Z close persists", () => {
    cy.loginAndCache(admin, password)
    cy.visit("/reports/x")
    cy.contains("70,000")    // gross
    cy.contains("50,000")    // cash
    cy.contains("Close shift").click()
    cy.get("#declared").type("50000")
    cy.contains("Close shift").click()
    cy.visit("/reports/z")
    cy.contains("Z #1")
  })
})
```

- [ ] **Step 2: Extend `cypress/e2e/09-mobile-admin-screens.cy.ts`**

Add two `it()` blocks after the existing tests:

```ts
it("reports/x renders without horizontal scroll on mobile", () => {
  cy.visit("/reports/x")
  cy.wait(800)
  assertNoHorizontalOverflow()
})
it("reports/z renders without horizontal scroll on mobile", () => {
  cy.visit("/reports/z")
  cy.wait(800)
  assertNoHorizontalOverflow()
})
```

- [ ] **Step 3: Commit**

```bash
git add cypress/e2e/10-shift-reports.cy.ts cypress/e2e/09-mobile-admin-screens.cy.ts
git commit -m "test(reports): cypress for shift X/Z + mobile overflow"
```

---

## Task 8: Run the full test/lint sweep + check off tasks.md

- [ ] **Step 1: Lint + format**

Run: `pnpm check`
Expected: clean.

- [ ] **Step 2: Run unit tests**

Run: `pnpm test`
Expected: pass.

- [ ] **Step 3: Update `docs/tasks.md`** — replace each `[]` with `[x]` for all 5 items.

- [ ] **Step 4: Commit**

```bash
git add docs/tasks.md
git commit -m "docs(tasks): mark all docs/tasks.md items complete"
```

---

## Notes for the executor

- **Order matters:** Task 1 (schema) must land before Tasks 2 & 6 (those reference the new tables). Tasks 3, 4 depend on Task 2. Task 5 is independent. Task 6 depends on Tasks 1 & 5. Task 7 depends on everything before it.
- **Mobile flow (Task 1 of the spec)** is already in place — Tasks 5, 6, and 7 in this plan finish the remaining mobile-facing piece (camera capture + verification).
- **If `db:push:all` fails** because `.env.test` isn't configured, run `pnpm db:push` alone for development and skip the test DB; vitest will spin up against the dev DB. Adjust by running `pnpm db:push:test` once env is sorted.
- **If `qrcode` types aren't found** after install, restart the TS server / re-run `pnpm install` so pnpm symlinks the types correctly.
- **No `document.write`** in `print-shift-closure.ts` — follow the existing `src/lib/pos/print-receipt.ts` Blob-URL pattern.
