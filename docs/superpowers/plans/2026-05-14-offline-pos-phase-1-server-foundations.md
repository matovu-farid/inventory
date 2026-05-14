# Offline POS — Phase 1: Server Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the server-side foundations the offline POS phase depends on — `terminal_devices` registry, idempotent `recordSale`, oversell flag, payment-method gating telemetry, and the heartbeat + device-id middleware. No client-side offline behaviour yet; this phase is what the WebView wrapper and offline-capable web app (later phases) will lean on.

**Architecture:** Drizzle schema additions + new schema file for `terminal_devices`. The existing `recordSale` server function is extended with idempotency keys, oversell detection, and an `recorded_offline` flag. New server functions for terminal CRUD live in `src/server/functions/admin/terminals.ts`. A new middleware validates the `x-device-id` header against the terminals table for any request originating from a paired device. A new admin UI route at `/settings/terminals` exposes pairing, listing, and revocation.

**Tech Stack:**
- Drizzle ORM 0.45.x + Postgres (Neon) — DB
- TanStack Start `createServerFn` — server functions
- Better Auth + admin plugin — for the impersonation step in pairing
- Zod — input validation
- Vitest — tests, co-located in `src/__tests__/`
- TanStack Router file-based routing — admin UI

**Reference spec:** `docs/superpowers/specs/2026-05-14-offline-pos-terminal-design.md`

---

## Pre-flight

Before starting, run these once to confirm the workspace is clean:

```bash
git status
pnpm install
pnpm db:push     # apply current schema to dev DB
pnpm test --run  # ensure baseline green
```

Expected: clean tree, all tests passing.

---

## Task 1: Add idempotency/oversell/offline columns to `shop_sales` schema

**Files:**
- Modify: `src/db/schema/sales.ts`

- [ ] **Step 1: Add the three new columns to the `shopSales` table definition**

Open `src/db/schema/sales.ts` and add the columns after `documentNumber` (line 48) and before `notes`. Final state of those lines:

```typescript
    customerId: uuid("customer_id"),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("settled"),
    outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "restrict" }),
    documentNumber: text("document_number"),
    idempotencyKey: uuid("idempotency_key").unique(),
    recordedOffline: boolean("recorded_offline").notNull().default(false),
    oversellFlagged: boolean("oversell_flagged").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
```

- [ ] **Step 2: Add an index on `oversell_flagged` (partial index — only flagged rows)**

Update the `table` callback at the end of the `shopSales` definition:

```typescript
  (table) => [
    index("idx_sale_shop").on(table.shopId),
    index("idx_sale_date").on(table.saleDate),
    index("idx_sale_soldby").on(table.soldBy),
    index("idx_sale_customer").on(table.customerId),
    index("idx_sale_status").on(table.paymentStatus),
    index("idx_sale_oversell_flagged")
      .on(table.oversellFlagged)
      .where(sql`oversell_flagged = TRUE`),
  ],
```

You'll need to import `sql` from `drizzle-orm` at the top of the file (it isn't imported yet):

```typescript
import { relations, sql } from "drizzle-orm"
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm db:generate
```

Expected: a new file appears in `drizzle/`, e.g. `0026_<auto-name>.sql`, containing `ALTER TABLE "shop_sales" ADD COLUMN ...` for the three new columns and `CREATE INDEX` for the new partial index.

- [ ] **Step 4: Inspect the generated SQL and verify it matches expectations**

Open the generated `drizzle/00NN_*.sql` and confirm it contains exactly the four operations above. If it tries to drop unrelated columns, abort — re-run `pnpm db:push` first to make sure dev DB is in sync with `main` schema.

- [ ] **Step 5: Apply to dev DB and commit**

```bash
pnpm db:push
git add src/db/schema/sales.ts drizzle/
git commit -m "feat(db): add idempotency, recorded_offline, oversell_flagged to shop_sales"
```

---

## Task 2: Create the `terminal_devices` Drizzle schema

**Files:**
- Create: `src/db/schema/terminal-devices.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/db/schema/terminal-devices.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { shops } from "./shops"

export const terminalStatusEnum = pgEnum("terminal_status", ["active", "revoked"])

export const terminalDevices = pgTable(
  "terminal_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceLabel: text("device_label").notNull(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    cashierUserId: text("cashier_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    pairedAt: timestamp("paired_at", { withTimezone: true }).defaultNow().notNull(),
    pairedByAdminId: text("paired_by_admin_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    appVersion: text("app_version"),
    androidVersion: text("android_version"),
    hardwareModel: text("hardware_model"),
    status: terminalStatusEnum("status").notNull().default("active"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAdminId: text("revoked_by_admin_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_terminal_shop").on(table.shopId),
    index("idx_terminal_cashier").on(table.cashierUserId),
    index("idx_terminal_active").on(table.status, table.shopId),
  ],
)

export const terminalDeviceRelations = relations(terminalDevices, ({ one }) => ({
  shop: one(shops, { fields: [terminalDevices.shopId], references: [shops.id] }),
  cashier: one(user, {
    fields: [terminalDevices.cashierUserId],
    references: [user.id],
    relationName: "terminalCashier",
  }),
  pairedByAdmin: one(user, {
    fields: [terminalDevices.pairedByAdminId],
    references: [user.id],
    relationName: "terminalPairedByAdmin",
  }),
  revokedByAdmin: one(user, {
    fields: [terminalDevices.revokedByAdminId],
    references: [user.id],
    relationName: "terminalRevokedByAdmin",
  }),
}))
```

- [ ] **Step 2: Export from `src/db/schema/index.ts`**

Open `src/db/schema/index.ts` and add (alphabetised with the other exports):

```typescript
export * from "./terminal-devices"
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm db:generate
```

Expected: a new file in `drizzle/`, e.g. `0027_<auto-name>.sql`, containing `CREATE TYPE "public"."terminal_status" ...` and `CREATE TABLE "terminal_devices" ...`.

- [ ] **Step 4: Apply and commit**

```bash
pnpm db:push
git add src/db/schema/terminal-devices.ts src/db/schema/index.ts drizzle/
git commit -m "feat(db): add terminal_devices table for paired POS terminals"
```

---

## Task 3: Add `terminals.manage` permission

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `src/__tests__/permissions.test.ts` (existing — will auto-validate the new permission)

- [ ] **Step 1: Add the permission string to the `Permission` union**

In `src/lib/permissions.ts`, add `"terminals.manage"` to the union (line 16):

```typescript
export type Permission =
  | "procurement.view"
  | "warehouse.stock"
  // ...existing entries...
  | "shift.reports.view"
  | "terminals.manage"
```

- [ ] **Step 2: Grant the permission to admins only**

In the same file, update `ROLE_PERMISSIONS.admin` (line 35) to include `"terminals.manage"` — alphabetised near the end:

```typescript
  admin: [
    "procurement.view",
    // ...existing...
    "security.manage",
    "shift.reports.view",
    "terminals.manage",
  ],
```

Do NOT grant to `supervisor` or `sales`.

- [ ] **Step 3: Add server-gate mapping (will be filled in once the server function exists in Task 6)**

In the same file, add to `PERMISSION_SERVER_GATES`:

```typescript
  "terminals.manage": ["src/server/functions/admin/terminals.ts"],
```

- [ ] **Step 4: Run the permissions test (it will fail because the server file doesn't exist yet)**

```bash
pnpm test --run src/__tests__/permissions.test.ts
```

Expected: FAIL with a message about `src/server/functions/admin/terminals.ts` not existing. That's correct — we'll fix it in Task 6.

- [ ] **Step 5: Commit the registry update** (don't worry about the failing permissions test; Task 6 resolves it)

```bash
git add src/lib/permissions.ts
git commit -m "feat(perms): add terminals.manage permission for admin role"
```

---

## Task 4: Extend `recordSale` input schema with idempotency + recorded-offline

**Files:**
- Modify: `src/server/functions/shop/sales.ts:90-98` (recordSaleInput)
- Test: `src/__tests__/sales-server.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test for idempotency**

If `src/__tests__/sales-server.test.ts` does not exist, create it. Add the test:

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { shopSales } from "#/db/schema"
import { eq } from "drizzle-orm"
import { recordSale } from "#/server/functions/shop/sales"
import { seedTestSale } from "./helpers/sales-seed"  // see Step 2

describe("recordSale idempotency", () => {
  it("returns the existing sale row when called twice with the same idempotency key", async () => {
    const { shopId, stockId } = await seedTestSale()
    const idempotencyKey = crypto.randomUUID()

    const first = await recordSale({
      data: {
        shopId,
        paymentMethod: "cash",
        items: [{ shopStockId: stockId, quantity: 1, unitPriceUgx: "5000" }],
        idempotencyKey,
      },
    })

    const second = await recordSale({
      data: {
        shopId,
        paymentMethod: "cash",
        items: [{ shopStockId: stockId, quantity: 1, unitPriceUgx: "5000" }],
        idempotencyKey,
      },
    })

    expect(first.id).toBe(second.id)

    const allRows = await db
      .select()
      .from(shopSales)
      .where(eq(shopSales.idempotencyKey, idempotencyKey))
    expect(allRows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Create the test seed helper**

If it doesn't exist, create `src/__tests__/helpers/sales-seed.ts`. Look at how existing tests seed data (e.g. `src/__tests__/products-server.test.ts`) and follow the same pattern. It should create a shop, a product with one variant, and a `shop_stock` row, returning `{ shopId, stockId, productId }`. Use the existing test DB (`.env.test`).

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm test --run src/__tests__/sales-server.test.ts
```

Expected: FAIL — either "idempotencyKey is not a known input" (Zod rejected it) or two rows inserted.

- [ ] **Step 4: Extend the Zod input to accept the key**

In `src/server/functions/shop/sales.ts`, update `recordSaleInput`:

```typescript
const recordSaleInput = z.object({
  shopId: z.uuid(),
  paymentMethod: z.enum(["cash", "bank", "credit"]),
  bankAccountId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  items: z.array(saleItemInput).min(1),
  approvedBy: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.uuid().optional(),
  recordedOffline: z.boolean().optional(),
})
```

- [ ] **Step 5: Implement the idempotency check inside the transaction**

Find the transaction block in the `recordSale` handler. At the top of the transaction (before any inserts), add:

```typescript
const idempotencyKey = data.idempotencyKey ?? crypto.randomUUID()

const existing = await tx
  .select()
  .from(shopSales)
  .where(eq(shopSales.idempotencyKey, idempotencyKey))
  .limit(1)
if (existing.length > 0) {
  return existing[0]   // already processed — return prior result
}
```

Then, when inserting the sale row, include the key:

```typescript
await tx.insert(shopSales).values({
  // ...existing fields...
  idempotencyKey,
  recordedOffline: data.recordedOffline ?? false,
})
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm test --run src/__tests__/sales-server.test.ts
```

Expected: PASS (idempotency test green).

- [ ] **Step 7: Commit**

```bash
git add src/server/functions/shop/sales.ts src/__tests__/sales-server.test.ts src/__tests__/helpers/sales-seed.ts
git commit -m "feat(sales): idempotent recordSale via idempotencyKey + recordedOffline flag"
```

---

## Task 5: Add oversell detection to `recordSale`

**Files:**
- Modify: `src/server/functions/shop/sales.ts` (the stock-decrement block in the transaction)
- Test: `src/__tests__/sales-server.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/sales-server.test.ts`:

```typescript
describe("recordSale oversell handling", () => {
  it("flags the sale as oversell when stock would go negative, but still records it", async () => {
    const { shopId, stockId } = await seedTestSale({ initialStock: 1 })

    const sale = await recordSale({
      data: {
        shopId,
        paymentMethod: "cash",
        items: [{ shopStockId: stockId, quantity: 5, unitPriceUgx: "5000" }],
      },
    })

    expect(sale.oversellFlagged).toBe(true)

    const stockAfter = await db.query.shopStock.findFirst({
      where: (s, { eq }) => eq(s.id, stockId),
    })
    expect(stockAfter?.quantityOnHand).toBe(-4)
  })

  it("does NOT flag a normal sale within stock", async () => {
    const { shopId, stockId } = await seedTestSale({ initialStock: 10 })

    const sale = await recordSale({
      data: {
        shopId,
        paymentMethod: "cash",
        items: [{ shopStockId: stockId, quantity: 3, unitPriceUgx: "5000" }],
      },
    })

    expect(sale.oversellFlagged).toBe(false)
  })
})
```

Update `seedTestSale` to accept an optional `{ initialStock }` parameter and set `quantityOnHand` accordingly.

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test --run src/__tests__/sales-server.test.ts
```

Expected: FAIL on oversell test — current code probably throws a "not enough stock" error or sets `oversellFlagged=false`.

- [ ] **Step 3: Replace the existing stock-availability check with oversell detection**

Find the block in `recordSale`'s transaction that currently validates stock and either throws an error or decrements. Replace the "throw if not enough" path with:

```typescript
// Determine oversell status BEFORE decrementing
let oversellFlagged = false
for (const item of data.items) {
  const current = await tx
    .select({ qty: shopStock.quantityOnHand })
    .from(shopStock)
    .where(eq(shopStock.id, item.shopStockId))
    .limit(1)

  if (current.length === 0) {
    throw new Error(`Stock item ${item.shopStockId} does not exist`)
  }
  if (current[0].qty < item.quantity) {
    oversellFlagged = true
    // intentionally do NOT throw — we accept the sale
  }
}
```

When inserting the sale row, pass the flag:

```typescript
await tx.insert(shopSales).values({
  // ...existing fields...
  idempotencyKey,
  recordedOffline: data.recordedOffline ?? false,
  oversellFlagged,
})
```

Keep the stock decrement as it is — `quantityOnHand` is allowed to go negative now.

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test --run src/__tests__/sales-server.test.ts
```

Expected: PASS (both oversell tests + the earlier idempotency test stay green).

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/shop/sales.ts src/__tests__/sales-server.test.ts src/__tests__/helpers/sales-seed.ts
git commit -m "feat(sales): allow oversell; flag affected sales for admin review"
```

---

## Task 6: Server function — `pairTerminal`

**Files:**
- Create: `src/server/functions/admin/terminals.ts`
- Test: `src/__tests__/terminals-server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/terminals-server.test.ts
import { describe, it, expect } from "vitest"
import { db } from "#/db"
import { terminalDevices } from "#/db/schema"
import { eq } from "drizzle-orm"
import { pairTerminal } from "#/server/functions/admin/terminals"
import { seedTestUserAndShop } from "./helpers/terminals-seed"

describe("pairTerminal", () => {
  it("creates an active terminal_devices row owned by the admin who paired", async () => {
    const { adminId, cashierId, shopId } = await seedTestUserAndShop()

    const terminal = await pairTerminal({
      data: {
        shopId,
        cashierUserId: cashierId,
        deviceLabel: "Counter 1",
        hardwareModel: "Sunmi V2s",
        androidVersion: "11",
        appVersion: "1.0.0",
      },
      // test harness will inject session as adminId — see helpers
    })

    expect(terminal.id).toBeDefined()
    expect(terminal.status).toBe("active")
    expect(terminal.deviceLabel).toBe("Counter 1")
    expect(terminal.pairedByAdminId).toBe(adminId)

    const fromDb = await db
      .select()
      .from(terminalDevices)
      .where(eq(terminalDevices.id, terminal.id))
    expect(fromDb).toHaveLength(1)
  })

  it("rejects pairing when the caller is not an admin", async () => {
    const { cashierId, shopId } = await seedTestUserAndShop()

    await expect(
      pairTerminal({
        data: { shopId, cashierUserId: cashierId, deviceLabel: "X" },
      }),
    ).rejects.toThrow(/admin/i)
  })
})
```

Create `src/__tests__/helpers/terminals-seed.ts` — copy the pattern from existing test seeds. It should create one admin user, one sales user, and one shop, returning `{ adminId, cashierId, shopId }`. Look at how `src/__tests__/permissions.test.ts` or `products-server.test.ts` set up the session/role context.

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: FAIL — module `#/server/functions/admin/terminals` not found.

- [ ] **Step 3: Create the server function file**

```typescript
// src/server/functions/admin/terminals.ts
import { createServerFn } from "@tanstack/react-start"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { terminalDevices } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const pairTerminalInput = z.object({
  shopId: z.uuid(),
  cashierUserId: z.string().min(1),
  deviceLabel: z.string().min(1).max(64),
  hardwareModel: z.string().max(64).optional(),
  androidVersion: z.string().max(16).optional(),
  appVersion: z.string().max(32).optional(),
})

export const pairTerminal = createServerFn()
  .inputValidator(pairTerminalInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const [row] = await db
      .insert(terminalDevices)
      .values({
        shopId: data.shopId,
        cashierUserId: data.cashierUserId,
        deviceLabel: data.deviceLabel,
        hardwareModel: data.hardwareModel,
        androidVersion: data.androidVersion,
        appVersion: data.appVersion,
        pairedByAdminId: session.user.id,
      })
      .returning()

    return row
  })
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: PASS (both pair-terminal tests green).

- [ ] **Step 5: Re-run the permissions test (was failing in Task 3)**

```bash
pnpm test --run src/__tests__/permissions.test.ts
```

Expected: PASS — `terminals.manage` now has a real server file that contains `requireRole`.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/admin/terminals.ts src/__tests__/terminals-server.test.ts src/__tests__/helpers/terminals-seed.ts
git commit -m "feat(terminals): pairTerminal server function (admin-only)"
```

---

## Task 7: Server function — `listTerminals` and `revokeTerminal`

**Files:**
- Modify: `src/server/functions/admin/terminals.ts`
- Modify: `src/__tests__/terminals-server.test.ts`

- [ ] **Step 1: Write the failing tests for list + revoke**

Append to `src/__tests__/terminals-server.test.ts`:

```typescript
import { listTerminals, revokeTerminal } from "#/server/functions/admin/terminals"

describe("listTerminals", () => {
  it("returns all terminals, newest first", async () => {
    const { adminId, cashierId, shopId } = await seedTestUserAndShop()
    await pairTerminal({ data: { shopId, cashierUserId: cashierId, deviceLabel: "A" } })
    await pairTerminal({ data: { shopId, cashierUserId: cashierId, deviceLabel: "B" } })

    const list = await listTerminals()
    expect(list[0].deviceLabel).toBe("B")
    expect(list[1].deviceLabel).toBe("A")
  })
})

describe("revokeTerminal", () => {
  it("marks the terminal as revoked and records the admin who did it", async () => {
    const { adminId, cashierId, shopId } = await seedTestUserAndShop()
    const term = await pairTerminal({
      data: { shopId, cashierUserId: cashierId, deviceLabel: "X" },
    })

    const revoked = await revokeTerminal({ data: { terminalId: term.id } })

    expect(revoked.status).toBe("revoked")
    expect(revoked.revokedByAdminId).toBe(adminId)
    expect(revoked.revokedAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: FAIL — `listTerminals` and `revokeTerminal` not exported.

- [ ] **Step 3: Implement `listTerminals`**

Append to `src/server/functions/admin/terminals.ts`:

```typescript
export const listTerminals = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  return db.query.terminalDevices.findMany({
    with: {
      shop: { columns: { id: true, name: true } },
      cashier: { columns: { id: true, name: true, email: true } },
      pairedByAdmin: { columns: { id: true, name: true } },
    },
    orderBy: (t, { desc }) => [desc(t.pairedAt)],
  })
})
```

- [ ] **Step 4: Implement `revokeTerminal`**

Append:

```typescript
const revokeTerminalInput = z.object({
  terminalId: z.uuid(),
})

export const revokeTerminal = createServerFn()
  .inputValidator(revokeTerminalInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const [row] = await db
      .update(terminalDevices)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedByAdminId: session.user.id,
      })
      .where(eq(terminalDevices.id, data.terminalId))
      .returning()

    if (!row) throw new Error("Terminal not found")
    return row
  })
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/admin/terminals.ts src/__tests__/terminals-server.test.ts
git commit -m "feat(terminals): listTerminals and revokeTerminal server functions"
```

---

## Task 8: Pairing endpoint that mints the cashier session

**Files:**
- Modify: `src/server/functions/admin/terminals.ts`
- Modify: `src/__tests__/terminals-server.test.ts`

This task layers a second step on top of `pairTerminal`: after creating the row, return a cashier-scoped session cookie so the device immediately becomes "signed in as the cashier" without the admin's session lingering.

- [ ] **Step 1: Verify Better Auth admin plugin's impersonation API**

Open `src/lib/auth.ts` and confirm the `admin` plugin is included (it is, per the codebase scan). Better Auth's admin plugin exposes `auth.api.impersonateUser({ body: { userId } })` which returns a session for the impersonated user without invalidating the admin's session. Read the existing Better Auth setup carefully — if the version doesn't expose impersonation, fall back to creating a session row manually via Drizzle (see Step 4 alternative).

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/terminals-server.test.ts`:

```typescript
describe("pairTerminal returns a cashier session", () => {
  it("returns a session token tied to the cashier user, not the admin", async () => {
    const { adminId, cashierId, shopId } = await seedTestUserAndShop()

    const result = await pairTerminal({
      data: { shopId, cashierUserId: cashierId, deviceLabel: "Counter 1" },
    })

    expect(result.cashierSessionToken).toBeDefined()
    expect(typeof result.cashierSessionToken).toBe("string")
    // The token should resolve to the cashier when validated
    // (specific assertion depends on Better Auth's verify API — see auth helpers)
  })
})
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: FAIL — `cashierSessionToken` is undefined.

- [ ] **Step 4: Extend `pairTerminal` to mint the cashier session**

Replace the return shape of `pairTerminal`. After inserting the row, call Better Auth's impersonation API and return both:

```typescript
import { auth } from "#/lib/auth"
// ... existing imports

export const pairTerminal = createServerFn()
  .inputValidator(pairTerminalInput)
  .handler(async ({ data, context }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const [row] = await db
      .insert(terminalDevices)
      .values({
        shopId: data.shopId,
        cashierUserId: data.cashierUserId,
        deviceLabel: data.deviceLabel,
        hardwareModel: data.hardwareModel,
        androidVersion: data.androidVersion,
        appVersion: data.appVersion,
        pairedByAdminId: session.user.id,
      })
      .returning()

    // Mint a cashier-scoped session via Better Auth's admin plugin.
    // The result.token is a long-lived session token to be installed
    // in the Android WebView's CookieManager.
    const impersonation = await auth.api.impersonateUser({
      body: { userId: data.cashierUserId },
      headers: context.request.headers,
    })

    return {
      ...row,
      cashierSessionToken: impersonation.token,
      cashierSessionExpiresAt: impersonation.session.expiresAt,
    }
  })
```

**Alternative if `auth.api.impersonateUser` is not available in this Better Auth version:** create a session row directly using the existing pattern from `src/lib/auth.ts`. The session table is exported as `session` from `src/db/schema/auth.ts`. Insert with `userId = cashierUserId`, generate a 64-char random `id` and `token`, set `expiresAt = now + 90 days`, return the token.

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test --run src/__tests__/terminals-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/admin/terminals.ts src/__tests__/terminals-server.test.ts
git commit -m "feat(terminals): pairTerminal mints a cashier session for the device"
```

---

## Task 9: `x-device-id` middleware

**Files:**
- Create: `src/server/middleware/terminal-device.ts`
- Test: `src/__tests__/terminal-device-middleware.test.ts`
- Modify: `src/server/functions/shop/sales.ts` (wire the middleware into `recordSale`)

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/terminal-device-middleware.test.ts
import { describe, it, expect } from "vitest"
import { validateTerminalDevice } from "#/server/middleware/terminal-device"
import { db } from "#/db"
import { terminalDevices } from "#/db/schema"
import { eq } from "drizzle-orm"
import { seedTestUserAndShop } from "./helpers/terminals-seed"

describe("validateTerminalDevice", () => {
  it("returns the active terminal when x-device-id matches a paired, active device", async () => {
    const { cashierId, shopId, adminId } = await seedTestUserAndShop()
    const [t] = await db
      .insert(terminalDevices)
      .values({
        shopId,
        cashierUserId: cashierId,
        deviceLabel: "Counter 1",
        pairedByAdminId: adminId,
      })
      .returning()

    const result = await validateTerminalDevice(t.id)
    expect(result.status).toBe("active")
    expect(result.id).toBe(t.id)
  })

  it("throws 403 when the device is revoked", async () => {
    const { cashierId, shopId, adminId } = await seedTestUserAndShop()
    const [t] = await db
      .insert(terminalDevices)
      .values({
        shopId,
        cashierUserId: cashierId,
        deviceLabel: "Counter 1",
        pairedByAdminId: adminId,
        status: "revoked",
      })
      .returning()

    await expect(validateTerminalDevice(t.id)).rejects.toThrow(/revoked/i)
  })

  it("throws when the device id is not in the registry", async () => {
    await expect(validateTerminalDevice(crypto.randomUUID())).rejects.toThrow(/unknown/i)
  })

  it("is a no-op for requests without the header (browser-from-desktop case)", async () => {
    const result = await validateTerminalDevice(undefined)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test --run src/__tests__/terminal-device-middleware.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the middleware**

```typescript
// src/server/middleware/terminal-device.ts
import { db } from "#/db"
import { terminalDevices } from "#/db/schema"
import { eq } from "drizzle-orm"

/**
 * Validate a terminal device ID coming from the `x-device-id` header.
 *
 * Returns the terminal row if active. Throws if the device is revoked
 * or unknown. Returns null if no device ID was provided (i.e. request
 * came from a desktop browser, not a paired terminal) — caller decides
 * whether that's acceptable.
 *
 * Also updates `last_seen_at` as a side-effect.
 */
export async function validateTerminalDevice(deviceId: string | undefined | null) {
  if (!deviceId) return null

  const [row] = await db
    .select()
    .from(terminalDevices)
    .where(eq(terminalDevices.id, deviceId))
    .limit(1)

  if (!row) {
    throw new Error(`Unknown terminal device: ${deviceId}`)
  }
  if (row.status === "revoked") {
    throw new Error(`Terminal device has been revoked`)
  }

  // Best-effort last-seen update (do not block on failure)
  void db
    .update(terminalDevices)
    .set({ lastSeenAt: new Date() })
    .where(eq(terminalDevices.id, deviceId))
    .catch(() => undefined)

  return row
}

/**
 * Read the device ID from the incoming request headers.
 * Returns undefined if the header is absent.
 */
export function deviceIdFromHeaders(headers: Headers): string | undefined {
  const raw = headers.get("x-device-id")
  return raw && raw.length > 0 ? raw : undefined
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test --run src/__tests__/terminal-device-middleware.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire into `recordSale`**

In `src/server/functions/shop/sales.ts`, at the top of the `recordSale` handler — after `requireSession` and `requireRole` but before the transaction — add:

```typescript
import { validateTerminalDevice, deviceIdFromHeaders } from "#/server/middleware/terminal-device"

// inside the handler:
const deviceId = deviceIdFromHeaders(context.request.headers)
await validateTerminalDevice(deviceId)   // throws if revoked/unknown; null if absent (desktop)
```

You'll need to ensure the handler receives the request context (TanStack Start's `createServerFn` handler signature receives `{ data, context }` where `context.request` is the Request — verify against an existing server function that reads headers, e.g. anything that reads cookies).

- [ ] **Step 6: Add a test that recordSale rejects writes from a revoked device**

Append to `src/__tests__/sales-server.test.ts`:

```typescript
describe("recordSale + terminal device validation", () => {
  it("rejects the sale when called with x-device-id of a revoked terminal", async () => {
    const { shopId, stockId, revokedDeviceId } = await seedTestSaleWithRevokedTerminal()

    await expect(
      recordSale(
        {
          data: {
            shopId,
            paymentMethod: "cash",
            items: [{ shopStockId: stockId, quantity: 1, unitPriceUgx: "5000" }],
          },
        },
        // test harness — inject headers including x-device-id
        { headers: { "x-device-id": revokedDeviceId } },
      ),
    ).rejects.toThrow(/revoked/i)
  })
})
```

Extend `seedTestSale` to optionally return a revoked terminal device ID.

- [ ] **Step 7: Run the full test suite**

```bash
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/server/middleware/terminal-device.ts src/server/functions/shop/sales.ts src/__tests__/terminal-device-middleware.test.ts src/__tests__/sales-server.test.ts src/__tests__/helpers/
git commit -m "feat(server): x-device-id middleware; recordSale blocks revoked terminals"
```

---

## Task 10: Heartbeat server function

**Files:**
- Create: `src/server/functions/system/heartbeat.ts`
- Test: `src/__tests__/heartbeat-server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/heartbeat-server.test.ts
import { describe, it, expect } from "vitest"
import { serverHeartbeat } from "#/server/functions/system/heartbeat"

describe("serverHeartbeat", () => {
  it("returns ok and a server timestamp", async () => {
    const result = await serverHeartbeat()
    expect(result.ok).toBe(true)
    expect(typeof result.serverTime).toBe("number")
    expect(result.serverTime).toBeGreaterThan(Date.now() - 5000)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test --run src/__tests__/heartbeat-server.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the heartbeat**

```typescript
// src/server/functions/system/heartbeat.ts
import { createServerFn } from "@tanstack/react-start"

export const serverHeartbeat = createServerFn().handler(async () => {
  return { ok: true as const, serverTime: Date.now() }
})
```

No auth requirement — connectivity probe is intentionally cheap and pre-auth. The endpoint reveals nothing sensitive (just server time).

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test --run src/__tests__/heartbeat-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/system/heartbeat.ts src/__tests__/heartbeat-server.test.ts
git commit -m "feat(system): serverHeartbeat for connectivity probing"
```

---

## Task 11: Admin UI route — `/settings/terminals`

**Files:**
- Create: `src/routes/settings/terminals.tsx`
- Create: `src/components/settings/terminal-pairing-dialog.tsx`

This is a minimal admin UI: list of paired terminals (one row each), a "Pair new terminal" button that opens a dialog, and a per-row "Revoke" button.

- [ ] **Step 1: Create the route file**

```typescript
// src/routes/settings/terminals.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "#/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "#/components/ui/table"
import { requireUiPermission } from "#/lib/permissions"
import { listTerminals, revokeTerminal } from "#/server/functions/admin/terminals"
import { TerminalPairingDialog } from "#/components/settings/terminal-pairing-dialog"

export const Route = createFileRoute("/settings/terminals")({
  beforeLoad: ({ context }) => requireUiPermission(context, "terminals.manage"),
  loader: async () => {
    return { terminals: await listTerminals() }
  },
  component: TerminalsPage,
})

function TerminalsPage() {
  const { terminals: initial } = Route.useLoaderData()
  const qc = useQueryClient()

  const { data: terminals = initial } = useQuery({
    queryKey: ["terminals"],
    queryFn: () => listTerminals(),
    initialData: initial,
  })

  const revoke = useMutation({
    mutationFn: (terminalId: string) => revokeTerminal({ data: { terminalId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terminals"] }),
  })

  const [pairingOpen, setPairingOpen] = useState(false)

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Terminals</h1>
        <Button onClick={() => setPairingOpen(true)}>Pair new terminal</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Shop</TableHead>
            <TableHead>Cashier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Paired</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terminals.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.deviceLabel}</TableCell>
              <TableCell>{t.shop.name}</TableCell>
              <TableCell>{t.cashier.name}</TableCell>
              <TableCell>
                <span className={t.status === "active" ? "text-emerald-600" : "text-red-600"}>
                  {t.status}
                </span>
              </TableCell>
              <TableCell>
                {t.lastSeenAt ? new Date(t.lastSeenAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell>{new Date(t.pairedAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                {t.status === "active" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revoke.mutate(t.id)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {terminals.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No terminals paired yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <TerminalPairingDialog
        open={pairingOpen}
        onOpenChange={setPairingOpen}
        onPaired={() => qc.invalidateQueries({ queryKey: ["terminals"] })}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the pairing dialog component**

```typescript
// src/components/settings/terminal-pairing-dialog.tsx
import { useQuery, useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "#/components/ui/select"
import { pairTerminal } from "#/server/functions/admin/terminals"
import { listShops } from "#/server/functions/admin/shops"          // existing
import { listUsersByRole } from "#/server/functions/admin/users"    // existing

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaired: () => void
}

export function TerminalPairingDialog({ open, onOpenChange, onPaired }: Props) {
  const [shopId, setShopId] = useState("")
  const [cashierUserId, setCashierUserId] = useState("")
  const [deviceLabel, setDeviceLabel] = useState("")
  const [pairedResult, setPairedResult] = useState<
    | { cashierSessionToken: string; cashierSessionExpiresAt: Date | string }
    | null
  >(null)

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => listShops() })
  const cashiers = useQuery({
    queryKey: ["users-by-role", "sales"],
    queryFn: () => listUsersByRole({ data: { role: "sales" } }),
  })

  const pair = useMutation({
    mutationFn: () =>
      pairTerminal({
        data: { shopId, cashierUserId, deviceLabel },
      }),
    onSuccess: (result) => {
      setPairedResult({
        cashierSessionToken: result.cashierSessionToken,
        cashierSessionExpiresAt: result.cashierSessionExpiresAt,
      })
      onPaired()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair new terminal</DialogTitle>
        </DialogHeader>

        {!pairedResult ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Shop</Label>
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                <SelectContent>
                  {shops.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Cashier (sales role)</Label>
              <Select value={cashierUserId} onValueChange={setCashierUserId}>
                <SelectTrigger><SelectValue placeholder="Select cashier" /></SelectTrigger>
                <SelectContent>
                  {cashiers.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Device label</Label>
              <Input
                placeholder="Counter 1"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                onClick={() => pair.mutate()}
                disabled={!shopId || !cashierUserId || !deviceLabel || pair.isPending}
              >
                Pair
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              Pairing complete. On the terminal, scan/enter this code to finish setup:
            </p>
            <pre className="p-2 bg-muted text-xs break-all whitespace-pre-wrap">
              {pairedResult.cashierSessionToken}
            </pre>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(pairedResult.cashierSessionExpiresAt).toLocaleString()}.
            </p>
            <DialogFooter>
              <Button onClick={() => { setPairedResult(null); onOpenChange(false) }}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

If `listShops` or `listUsersByRole` server functions don't exist yet at those exact paths, locate the equivalent in the codebase (search `listShops`, `listUsers`) and adjust the import. Do NOT create new server functions for this — reuse what's there. If you must create one, add it as a small task before continuing.

- [ ] **Step 3: Add a sidebar link to the new route**

Open `src/components/app-sidebar.tsx` (or whatever the sidebar component is — search for "settings" link). Add a "Terminals" entry, visible only when the user has `terminals.manage`. Use the existing `useCan("...")` hook pattern (see `src/lib/permissions.ts`).

- [ ] **Step 4: Smoke-test in the browser**

```bash
pnpm dev
```

Then navigate to http://localhost:3000/settings/terminals as an admin user. Verify:
- The page loads.
- "Pair new terminal" opens the dialog.
- The dialog has dropdowns populated with shops and sales users.
- Pairing succeeds and displays the cashier session token.
- The list refreshes to show the new terminal.
- "Revoke" marks the terminal as revoked.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/terminals.tsx src/components/settings/terminal-pairing-dialog.tsx src/components/app-sidebar.tsx
git commit -m "feat(ui): /settings/terminals — pair, list, revoke smart-POS terminals"
```

---

## Task 12: Surface `oversell_flagged` filter in the existing sales list UI

**Files:**
- Modify: the existing shop-sales list page — find via `grep -r "listShopSales" src/routes/` (likely `src/routes/sales/` or `src/routes/shop/`)

- [ ] **Step 1: Locate the sales list route**

```bash
grep -rln "listShopSales" src/routes/
```

Open the file it points to. Take note of the existing filter UI structure (search field, payment-method filter, etc.).

- [ ] **Step 2: Add an "Oversell flagged only" toggle**

Following the existing filter pattern in that file, add a toggle (checkbox or pill button) labelled **"Oversell only"**. Filter the rendered list client-side: when active, only show rows where `oversellFlagged === true`.

If the existing list already uses `useQuery` against `listShopSales`, you can do this filter client-side. If you prefer server-side filtering, extend `listShopSales`'s Zod input with an optional `oversellOnly: z.boolean().optional()` and filter the `where` clause — but client-side is fine for MVP, since the list is already capped at 100 rows.

- [ ] **Step 3: Add a small badge column on each row showing "Oversell" when flagged**

```typescript
{sale.oversellFlagged && (
  <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-900">
    Oversell
  </span>
)}
```

Place it next to the sale ID or total, whichever is most visible.

- [ ] **Step 4: Add an InfoTip for "Oversell"**

Per project convention (memory: "Every form field, table header, and KPI card must have an InfoTip"), add an entry to `src/lib/help-dictionary.ts`:

```typescript
"sale.oversellFlagged": {
  title: "Oversell",
  description:
    "This sale was recorded when stock-on-hand was lower than the quantity sold. " +
    "It usually happens when two offline terminals sell the same item and reconnect — " +
    "review and reconcile before next stock-take.",
},
```

Wrap the badge in `<InfoTip helpKey="sale.oversellFlagged">...</InfoTip>`.

- [ ] **Step 5: Smoke-test**

```bash
pnpm dev
```

Manually create a sale that oversells (Task 5's test scenario, replicated through the UI), confirm the badge shows on the list and the toggle filters correctly.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ src/lib/help-dictionary.ts
git commit -m "feat(sales): show oversell flag badge and filter on sales list"
```

---

## Task 13: Final integration check

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test --run
```

Expected: all green. If anything fails, fix the underlying issue — do not skip.

- [ ] **Step 2: Run type-check**

```bash
pnpm typecheck   # or whatever the script is called — check package.json
```

Expected: zero errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: zero errors. Per project convention (memory: no-disable lint rule), if lint complains, fix the code — do NOT disable rules or add `// eslint-disable-next-line`.

- [ ] **Step 4: Confirm the migration applied to dev DB**

```bash
pnpm db:push
```

Expected: no further changes ("schema is up to date").

- [ ] **Step 5: Confirm the dev server boots**

```bash
pnpm dev
```

Visit `/settings/terminals` and verify no console errors.

- [ ] **Step 6: Commit any cleanup**

If anything was missed (formatting, etc.), commit it now:

```bash
git status
# if there are leftover files:
git add -p   # selectively stage
git commit -m "chore: post-integration cleanup"
```

---

## Self-review checklist (run before declaring phase complete)

- [ ] All 12 tasks committed.
- [ ] `pnpm test --run` is green.
- [ ] `pnpm typecheck` and `pnpm lint` are green.
- [ ] Migrations `0026` and `0027` (or whatever numbers got assigned) are checked in.
- [ ] `/settings/terminals` works end-to-end for an admin: pair → see in list → revoke → status shows revoked.
- [ ] `recordSale` accepts an idempotency key (same key twice = one row).
- [ ] `recordSale` allows oversell and flags the row.
- [ ] `recordSale` rejects requests carrying a revoked `x-device-id`.
- [ ] `serverHeartbeat` returns `{ ok: true, serverTime }` and requires no auth.

---

## What this phase does NOT include (deferred to later phases)

- The Android wrapper APK itself (Phase 4)
- PGlite local DB + Electric sync wiring (Phase 2)
- The outbox table and replay engine (Phase 2)
- Cashier UI changes — connectivity indicator, offline payment gating, reprint (Phase 3)
- Printer adapter (Phase 5)
- An "Outbox failures" admin queue UI (deferred until phase 2 has produced real failure data to design against)

---

## Next phase plans (to be written when phase 1 is shipped)

| Phase | Plan file (to be created) | Scope |
|---|---|---|
| **2 — Web offline core** | `docs/superpowers/plans/YYYY-MM-DD-offline-pos-phase-2-web-offline-core.md` | PGlite bootstrap, Electric client wiring with one shop's read shapes, `outbox` table + replay engine, connectivity probe wired to `serverHeartbeat`, Service Worker via vite-plugin-pwa |
| **3 — Cashier UX additions** | `docs/superpowers/plans/YYYY-MM-DD-offline-pos-phase-3-cashier-ux.md` | Connectivity indicator, outbox queue badge, offline payment-method gating in `checkout-sheet.tsx`, `/pos/reprint` route, mock `window.posPrinter` for dev |
| **4 — Android wrapper APK** | `docs/superpowers/plans/YYYY-MM-DD-offline-pos-phase-4-android-wrapper.md` | Kotlin project skeleton in `android/`, WebView host, pairing activity that captures the cashier session token from Task 8, `CookieManager` seeding, encrypted shared prefs, `x-device-id` header injection on every request, `window.posDevice` bridge |
| **5 — Printer integration** | `docs/superpowers/plans/YYYY-MM-DD-offline-pos-phase-5-printer.md` | `EscPosBluetoothAdapter` using DantSu library, `window.posPrinter` JS bridge, `ReceiptEscPosFormatter` (translates `ReceiptPayload` JSON to DantSu's DSL), hardware smoke tests on a real Sunmi V2s |

Each subsequent phase plan should be written **just before** that phase begins, so it reflects the actual state of the code (which will have drifted since phase 1).
