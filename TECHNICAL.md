# Technical Architecture Document: Inventory & Trade Management System

**Version:** 1.0
**Date:** 2026-04-24
**Status:** Draft
**Companion:** See `REQUIREMENTS.md` for business requirements, domain model, and accounting rules.

---

## 1. Architecture Overview

A single unified web application with role-based views, backed by a real-time sync layer and double-entry accounting engine.

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  ┌────────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ TanStack DB    │  │ TanStack    │  │ Role-Based       │  │
│  │ Collections    │  │ Router      │  │ Views            │  │
│  │ (reactive)     │  │ (routes)    │  │ (shadcn/ui)      │  │
│  └───────┬────────┘  └─────────────┘  └──────────────────┘  │
│          │ sync                              │ mutations     │
└──────────┼──────────────────────────────────┼────────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────┐              ┌──────────────────────────┐
│  ElectricSQL     │              │  Cloudflare Workers      │
│  Sync Service    │              │  (TanStack Start)        │
│                  │              │                          │
│  Hetzner (node1) │              │  Server Functions:       │
│  Docker Compose  │              │  - Mutations             │
└────────┬─────────┘              │  - Journal entries       │
         │                        │  - Auth / RBAC           │
         │ logical replication    │  - Business validation   │
         │                        └────────────┬─────────────┘
         │                                     │
         ▼                                     ▼ HTTP driver
┌──────────────────────────────────────────────────────────────┐
│                     Neon Postgres                             │
│                     (managed, free tier)                      │
│                                                              │
│  Tables: domain entities + ledger + auth                     │
│  Logical replication enabled                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### 2.1 Application Layer

| Concern | Technology | Package |
|---------|-----------|---------|
| Framework | TanStack Start | `@tanstack/react-start` |
| Routing | TanStack Router (file-based) | `@tanstack/react-router` |
| Server functions | TanStack Start server fns | Built-in |
| UI components | shadcn/ui + Radix UI | `@radix-ui/*` |
| Styling | Tailwind CSS v4 | `tailwindcss` |
| Icons | Lucide React | `lucide-react` |
| Forms | TanStack Form | `@tanstack/react-form` |
| Tables | TanStack Table | `@tanstack/react-table` |
| Validation | Zod | `zod` |
| Env vars | T3 Env | `@t3-oss/env-core` |
| PDF generation | React-PDF | `@react-pdf/renderer` |
| Excel parsing (import) | SheetJS | `xlsx` |
| Time-zone helpers | date-fns-tz | `date-fns-tz` |
| Email (notifications) | Resend | `resend` |

### 2.2 Data Layer

| Concern | Technology | Package |
|---------|-----------|---------|
| Database | Neon Postgres | `@neondatabase/serverless` |
| ORM | Drizzle ORM | `drizzle-orm` |
| Migrations | Drizzle Kit | `drizzle-kit` |
| Client state | TanStack DB | `@tanstack/react-db` |
| Real-time sync | ElectricSQL | `@electric-sql/client`, `@electric-sql/react` |
| Electric adapter | TanStack Electric collection | `@tanstack/electric-db-collection` |
| Precision math | BigNumber.js | `bignumber.js` |

### 2.3 Auth

| Concern | Technology | Package |
|---------|-----------|---------|
| Authentication | Better Auth | `better-auth` |
| Session format | JWT | Built into Better Auth |
| Auth method | Email/password (invite-only) | Built-in |

### 2.4 Infrastructure

| Concern | Technology | Notes |
|---------|-----------|-------|
| App hosting | Cloudflare Workers | Via `@cloudflare/vite-plugin` + Wrangler |
| Database | Neon Postgres | Free tier, managed backups |
| Sync engine | ElectricSQL (self-hosted) | Docker on Hetzner VPS (`ssh node1`) |
| Monitoring | Sentry | `@sentry/tanstackstart-react` |
| CI/CD (app) | GitHub Actions | Deploy to Cloudflare on push |
| CI/CD (Electric) | GitHub Actions | SSH deploy to node1, triggers only on compose file change |

---

## 3. Real-Time Data Flow

### 3.1 Read Path (Sync)

```
Neon Postgres
    │
    │ logical replication (WAL stream)
    ▼
ElectricSQL (node1)
    │
    │ HTTP shape stream (filtered by role/location)
    ▼
TanStack DB Collection (browser)
    │
    │ reactive subscription
    ▼
React Component (re-renders on data change)
```

1. Postgres WAL changes are streamed to ElectricSQL via logical replication
2. ElectricSQL serves **shapes** — filtered subsets of tables — over HTTP
3. `@tanstack/electric-db-collection` feeds shape data into TanStack DB collections
4. React components subscribe to collections and re-render reactively

### 3.2 Write Path (Mutations)

```
User action (e.g., record a sale)
    │
    ├──→ TanStack DB: optimistic update (instant UI)
    │
    └──→ Server function (Cloudflare Worker):
              │
              ├── Validate (role, permissions, business rules)
              ├── Write to Postgres (Drizzle ORM)
              ├── Post journal entries (ledger engine)
              └── Return txid
                    │
                    ▼
              ElectricSQL syncs change back
                    │
                    ▼
              TanStack DB reconciles (confirms or rolls back optimistic state)
```

### 3.3 Optimistic Update Pattern

```typescript
import { createCollection, createOptimisticAction } from "@tanstack/react-db"
import { electricCollectionOptions, isChangeMessage } from "@tanstack/electric-db-collection"

// Define a collection synced via ElectricSQL
const shopSalesCollection = createCollection(
  electricCollectionOptions({
    id: "shop-sales",
    schema: shopSaleSchema,
    shapeOptions: {
      url: "/api/electric-proxy/shop_sales",
      params: {
        where: `shop_id = '${userShopId}'`  // shape filter by user's shop
      }
    },
    getKey: (item) => item.id,

    onInsert: async ({ transaction }) => {
      const newSale = transaction.mutations[0].modified
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSale)
      })
      const { txid } = await response.json()
      return { txid }
    }
  })
)

// Optimistic action — UI updates instantly, server confirms async
const recordSale = createOptimisticAction({
  onMutate: (saleData) => {
    shopSalesCollection.insert({
      id: crypto.randomUUID(),
      ...saleData,
      saleDate: new Date()
    })
  },
  mutationFn: async (saleData) => {
    const response = await fetch("/api/sales", {
      method: "POST",
      body: JSON.stringify(saleData)
    })
    const { txid } = await response.json()
    await shopSalesCollection.utils.awaitTxId(txid)
  }
})
```

---

## 4. ElectricSQL Shapes

Shapes define what data syncs to each client. Filtered by user role and location.

### 4.1 Shape Definitions

| Shape | Table | Filter | Synced To |
|-------|-------|--------|-----------|
| Store stock | `store_stock` | `store_id = ?` | Admin, Supervisor |
| Shop stock | `shop_stock` | `shop_id = ?` | Admin, Supervisor, Sales (own shop) |
| Shop sales | `shop_sales` | `shop_id = ?` | Admin, Supervisor, Sales (own shop) |
| Shop sale items | `shop_sale_items` | via join to shop_sales | Same as shop sales |
| Store transfers | `store_transfers` | `shop_id = ?` or all | Admin, Supervisor |
| Transfer items | `store_transfer_items` | via join to transfers | Same as transfers |
| Suppliers | `suppliers` | none (all) | Admin, Supervisor |
| Supply routes | `supply_routes` | none (all) | Admin, Supervisor |
| Supply route items | `supply_route_items` | `supply_route_id = ?` | Admin, Supervisor |
| Shops | `shops` | none (all) | All roles |
| Bank accounts | `bank_accounts` | none (all) | Admin, Supervisor |
| Stock takes | `stock_takes` | `location_id = ?` | Admin, Supervisor |

### 4.2 Data NOT Synced (Server-Side Only)

These are queried on demand via server functions, not synced to the client:

- **Ledger transactions** — too many rows, only needed for reports
- **Transaction categories** — small reference table, loaded once
- **Financial reports** — computed server-side from ledger aggregations
- **Audit logs** — sensitive, only viewable by admin

### 4.3 Electric Proxy

The app proxies ElectricSQL requests to inject auth and filter shapes:

```typescript
// src/routes/api/electric-proxy/[table].ts
import { createServerFn } from '@tanstack/react-start'

export const GET = createServerFn()
  .handler(async ({ request }) => {
    const jwt = await verifyJWT(request)
    const table = getParam('table')

    // Add role-based where clause to shape request
    const shapeFilter = getShapeFilter(table, jwt.role, jwt.shopId)

    // Proxy to ElectricSQL with filter
    const electricUrl = `${ELECTRIC_URL}/v1/shape`
    const response = await fetch(electricUrl, {
      headers: { ...request.headers },
      params: { table, where: shapeFilter }
    })

    return response
  })
```

---

## 5. Server Functions

All mutations go through TanStack Start server functions. These enforce business rules and post journal entries.

### 5.1 Structure

```
src/server/
├── functions/
│   ├── supply/
│   │   ├── createSupplyRoute.ts
│   │   ├── addSupplyRouteItem.ts
│   │   └── addSupplyRouteExpense.ts
│   ├── store/
│   │   ├── receiveGoods.ts
│   │   ├── setMinimumPrice.ts
│   │   ├── createTransfer.ts
│   │   ├── confirmTransferDispatch.ts
│   │   ├── confirmTransferReceipt.ts
│   │   └── receiveReturnFromShop.ts     — store-side of shop→store return
│   ├── shop/
│   │   ├── recordSale.ts
│   │   ├── recordCustomerReturn.ts      — customer→shop return
│   │   ├── dispatchReturnToStore.ts     — shop→store return
│   │   ├── markGoodsDamaged.ts          — move stock to damaged bucket
│   │   ├── sellDamagedGoods.ts          — discounted sale of damaged stock
│   │   ├── writeOffDamagedGoods.ts      — write off damaged stock
│   │   └── addExpense.ts
│   ├── customers/
│   │   ├── createCustomer.ts
│   │   ├── recordPayment.ts             — applies payment FIFO across open sales
│   │   └── writeOffBadDebt.ts           — Admin-only
│   ├── accounting/
│   │   ├── postJournalEntry.ts
│   │   ├── reverseJournalEntry.ts       — creates a reversal group
│   │   ├── settleInterBranch.ts
│   │   ├── transferFunds.ts
│   │   └── addExpense.ts
│   ├── stocktake/
│   │   ├── startStockTake.ts
│   │   ├── recordCount.ts
│   │   └── reconcile.ts
│   ├── notifications/
│   │   ├── emit.ts                      — emitNotification helper
│   │   ├── markRead.ts
│   │   └── cron-checks.ts               — scheduled overdue/lag checks
│   └── admin/
│       ├── inviteUser.ts
│       ├── manageSupplier.ts
│       ├── manageBankAccount.ts
│       ├── auditLog.ts                  — Admin-only audit log queries
│       ├── systemSettings.ts            — thresholds + tuning
│       └── importExcel.ts               — historical route import
└── middleware/
    ├── auth.ts          — JWT verification
    ├── rbac.ts          — role-based access checks
    ├── idempotency.ts   — Idempotency-Key dedup (24h window)
    ├── audit.ts         — append AuditLog entries on sensitive ops
    └── validation.ts    — Zod schema validation
```

### 5.2 Server Function Pattern

Every mutation follows the same pattern:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { requireRole } from '#/server/middleware/rbac'
import { postJournalEntry } from '#/lib/accounting/ledger'

const recordSaleInput = z.object({
  shopId: z.string().uuid(),
  items: z.array(z.object({
    shopStockId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPriceUgx: z.string(),  // BigNumber string
  })),
  paymentMethod: z.enum(['cash', 'bank', 'credit']),
  bankAccountId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(), // required when paymentMethod = credit
})

export const recordSale = createServerFn()
  .validator(recordSaleInput)
  .handler(async ({ data, request }) => {
    const user = await requireRole(request, ['admin', 'supervisor', 'sales'])

    // Sales personnel can only sell from their assigned shop
    if (user.role === 'sales' && user.shopId !== data.shopId) {
      throw new Error('Unauthorized: not your shop')
    }

    // Credit sales require Admin or Supervisor — sales personnel cannot grant credit
    if (data.paymentMethod === 'credit') {
      await requireRole(request, ['admin', 'supervisor'])
      if (!data.customerId) throw new Error('customerId required for credit sale')
    }

    return await db.transaction(async (tx) => {
      // 1. Lock stock rows FOR UPDATE to prevent concurrent oversell
      for (const item of data.items) {
        const stock = await tx.execute(sql`
          SELECT * FROM shop_stock WHERE id = ${item.shopStockId} FOR UPDATE
        `)
        if (!stock || stock.quantityOnHand < item.quantity) {
          throw new Error(`Insufficient stock: ${stock?.productName}`)
        }
        if (BigNumber(item.unitPriceUgx).lt(stock.minimumSellPriceUgx)) {
          // Below-minimum requires admin/supervisor approval
          await requireRole(request, ['admin', 'supervisor'])
        }
      }

      // 2. Create sale record (paymentStatus depends on method)
      const totalAmount = calculateTotal(data.items)
      const paymentStatus = data.paymentMethod === 'credit' ? 'open' : 'settled'
      const [sale] = await tx.insert(shopSales).values({
        ...data,
        totalAmount,
        paymentStatus,
        outstandingBalance: data.paymentMethod === 'credit' ? totalAmount : '0',
        approvedBy: data.paymentMethod === 'credit' ? user.id : null,
      }).returning()

      // 3. Create sale items + decrement stock
      for (const item of data.items) {
        await tx.insert(shopSaleItems).values({ ... })
        await tx.update(shopStock)
          .set({ quantityOnHand: sql`quantity_on_hand - ${item.quantity}` })
          .where(eq(shopStock.id, item.shopStockId))
      }

      // 4. Post journal entries — A/R for credit, Cash/Bank otherwise
      const totalCost = calculateCost(data.items)
      const revenueDr = data.paymentMethod === 'credit' ? 'Accounts Receivable'
                     : data.paymentMethod === 'bank'   ? 'Bank'
                     :                                   'Cash'

      await postJournalEntry(tx, {
        entries: [
          { type: 'debit',  category: revenueDr,            amount: totalAmount },
          { type: 'credit', category: 'Sales Revenue',      amount: totalAmount },
          { type: 'debit',  category: 'Cost of Goods Sold', amount: totalCost },
          { type: 'credit', category: 'Inventory - Shop',   amount: totalCost },
        ],
        referenceType: 'shop_sale',
        referenceId: sale.id,
        locationType: 'shop',
        locationId: data.shopId,
        depositLocation: data.paymentMethod === 'credit' ? undefined : data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: user.id,
      })

      return { id: sale.id, txid: sale.txid }
    })
  })
```

### 5.3 Ledger Engine

Adapted from the money-lending project's `postJournalEntry()`:

```typescript
// src/lib/accounting/ledger.ts

interface JournalEntryParams {
  entries: Array<{
    type: 'debit' | 'credit'
    category: string        // category name
    amount: string          // BigNumber string
  }>
  referenceType: string
  referenceId: string
  locationType: 'store' | 'shop'
  locationId: string
  depositLocation?: 'cash' | 'bank'
  bankAccountId?: string
  recordedBy: string
  transactionDate?: Date
  description?: string
}

export async function postJournalEntry(tx: Transaction, params: JournalEntryParams) {
  const journalGroupId = crypto.randomUUID()

  // Validate: total debits must equal total credits
  const totalDebits = params.entries
    .filter(e => e.type === 'debit')
    .reduce((sum, e) => sum.plus(e.amount), BigNumber(0))

  const totalCredits = params.entries
    .filter(e => e.type === 'credit')
    .reduce((sum, e) => sum.plus(e.amount), BigNumber(0))

  if (!totalDebits.eq(totalCredits)) {
    throw new Error(`Journal entry unbalanced: DR ${totalDebits} != CR ${totalCredits}`)
  }

  // Insert all entries with the same journalGroupId
  for (const entry of params.entries) {
    const categoryId = await getOrCreateCategory(tx, entry.category)

    await tx.insert(transactions).values({
      id: crypto.randomUUID(),
      type: entry.type,
      amount: entry.amount,
      categoryId,
      journalGroupId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      locationType: params.locationType,
      locationId: params.locationId,
      depositLocation: params.depositLocation,
      bankAccountId: params.bankAccountId,
      recordedBy: params.recordedBy,
      transactionDate: params.transactionDate ?? new Date(),
      description: params.description,
    })
  }

  return journalGroupId
}
```

### 5.3.1 Reversing a Journal Group

Journal entries are immutable. To correct a posted entry, call `reverseJournalEntry()` — it loads the original group, flips each leg's type, posts a new group, and links the two groups via `reversesJournalGroupId` / `reversedByJournalGroupId`.

```typescript
// src/lib/accounting/ledger.ts

export async function reverseJournalEntry(
  tx: Transaction,
  originalJournalGroupId: string,
  reason: string,
  recordedBy: string,
) {
  const original = await tx.query.transactions.findMany({
    where: eq(transactions.journalGroupId, originalJournalGroupId)
  })
  if (original.length === 0) throw new Error('Journal group not found')
  if (original[0].reversedByJournalGroupId) {
    throw new Error('Journal group already reversed')
  }

  const reversalGroupId = crypto.randomUUID()
  for (const leg of original) {
    await tx.insert(transactions).values({
      ...leg,
      id: crypto.randomUUID(),
      type: leg.type === 'debit' ? 'credit' : 'debit',
      journalGroupId: reversalGroupId,
      reversesJournalGroupId: originalJournalGroupId,
      referenceType: 'reversal',
      description: `Reversal: ${reason}`,
      recordedBy,
      transactionDate: new Date(),
      createdAt: new Date(),
    })
  }

  await tx.update(transactions)
    .set({ reversedByJournalGroupId: reversalGroupId })
    .where(eq(transactions.journalGroupId, originalJournalGroupId))

  return reversalGroupId
}
```

Reversals are restricted to Admin/Supervisor and always write an `AuditLog` entry (see §5.6).

### 5.4 Ledger Query Service

All balances derived from the ledger, not from denormalized fields:

```typescript
// src/lib/accounting/ledger-queries.ts

// Get balance for an account category at a location
export async function getCategoryBalance(
  db: Database,
  categoryName: string,
  locationType: 'store' | 'shop',
  locationId: string,
  asOf?: Date
): Promise<BigNumber> {
  const category = await getCategoryByName(db, categoryName)

  const rows = await db.select({
    type: transactions.type,
    total: sql<string>`sum(${transactions.amount})`
  })
    .from(transactions)
    .where(and(
      eq(transactions.categoryId, category.id),
      eq(transactions.locationType, locationType),
      eq(transactions.locationId, locationId),
      asOf ? lte(transactions.transactionDate, asOf) : undefined
    ))
    .groupBy(transactions.type)

  // Apply account type rules:
  // Assets/Expenses: DR increases, CR decreases
  // Liabilities/Equity/Revenue: CR increases, DR decreases
  const isNormalDebit = ['asset', 'expense'].includes(category.type)

  let balance = BigNumber(0)
  for (const row of rows) {
    const amount = BigNumber(row.total)
    if (row.type === 'debit') {
      balance = isNormalDebit ? balance.plus(amount) : balance.minus(amount)
    } else {
      balance = isNormalDebit ? balance.minus(amount) : balance.plus(amount)
    }
  }

  return balance
}
```

### 5.5 Customer Payment Allocation (FIFO)

When a credit-customer payment arrives, the server applies it across that customer's open sales in `saleDate` order until the payment is exhausted, recording an explicit `customer_payment_applications` row per allocation.

```typescript
// src/server/functions/customers/recordPayment.ts
export const recordPayment = createServerFn()
  .validator(recordPaymentInput)
  .handler(async ({ data, request }) => {
    await requireRole(request, ['admin', 'supervisor', 'sales'])

    return await db.transaction(async (tx) => {
      const openSales = await tx.query.shopSales.findMany({
        where: and(
          eq(shopSales.customerId, data.customerId),
          inArray(shopSales.paymentStatus, ['open', 'partially_paid'])
        ),
        orderBy: asc(shopSales.saleDate),
      })

      let remaining = BigNumber(data.amount)
      const [payment] = await tx.insert(customerPayments).values({ ...data }).returning()

      for (const sale of openSales) {
        if (remaining.lte(0)) break
        const apply = BigNumber.min(remaining, sale.outstandingBalance)

        await tx.insert(customerPaymentApplications).values({
          customerPaymentId: payment.id,
          shopSaleId: sale.id,
          amountApplied: apply.toString(),
        })

        const newBalance = BigNumber(sale.outstandingBalance).minus(apply)
        await tx.update(shopSales)
          .set({
            outstandingBalance: newBalance.toString(),
            paymentStatus: newBalance.eq(0) ? 'settled' : 'partially_paid',
          })
          .where(eq(shopSales.id, sale.id))

        remaining = remaining.minus(apply)
      }

      if (remaining.gt(0)) {
        throw new Error(`Payment exceeds outstanding balance by ${remaining}`)
      }

      // Single ledger entry for the whole payment: DR Cash/Bank / CR A/R
      await postJournalEntry(tx, {
        entries: [
          { type: 'debit',  category: data.paymentMethod === 'bank' ? 'Bank' : 'Cash', amount: data.amount },
          { type: 'credit', category: 'Accounts Receivable',                            amount: data.amount },
        ],
        referenceType: 'customer_payment',
        referenceId: payment.id,
        locationType: 'shop',
        locationId: data.shopId,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: user.id,
      })

      return { id: payment.id }
    })
  })
```

### 5.6 Audit Logging Middleware

Sensitive operations (price changes, role changes, credit-sale authorizations, write-offs, journal reversals, stock reconciliation) write an `AuditLog` row in the same transaction as the change. A small middleware factory wraps server functions:

```typescript
// src/server/middleware/audit.ts
export const withAudit = (action: string) => async (
  tx: Transaction,
  ctx: { actorUserId: string; entityType: string; entityId: string;
         before?: unknown; after?: unknown; metadata?: unknown;
         request: Request },
) => {
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.actorUserId,
    action,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    before: ctx.before ?? null,
    after: ctx.after ?? null,
    metadata: ctx.metadata ?? null,
    ipAddress: ctx.request.headers.get('CF-Connecting-IP') ?? null,
    userAgent: ctx.request.headers.get('User-Agent') ?? null,
    createdAt: new Date(),
  })
}
```

The `audit_logs` table has no UPDATE or DELETE permissions granted at the database role level — append-only is enforced by the database, not just the application.

### 5.7 Idempotency Middleware

Every mutating server function reads the `Idempotency-Key` request header and stores `(key, response)` in a small `idempotency_keys` table with a 24-hour TTL. A retry with the same key returns the original response without re-executing the handler.

```typescript
// src/server/middleware/idempotency.ts
export async function withIdempotency<T>(
  request: Request,
  handler: () => Promise<T>,
): Promise<T> {
  const key = request.headers.get('Idempotency-Key')
  if (!key) return handler()

  const existing = await db.query.idempotencyKeys.findFirst({
    where: and(
      eq(idempotencyKeys.key, key),
      gt(idempotencyKeys.expiresAt, new Date()),
    ),
  })
  if (existing) return JSON.parse(existing.response) as T

  const result = await handler()
  await db.insert(idempotencyKeys).values({
    key,
    response: JSON.stringify(result),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  return result
}
```

### 5.8 Concurrency Strategy

All mutating operations on stock rows hold a row-level lock for the duration of the transaction:

```typescript
// Inside any server function that decrements / mutates stock:
const stock = await tx.execute(sql`
  SELECT * FROM shop_stock WHERE id = ${id} FOR UPDATE
`)
```

This applies to:
- `recordSale`, `sellDamagedGoods` (decrement)
- `confirmTransferReceipt`, `receiveReturnFromShop` (increment)
- `markGoodsDamaged`, `writeOffDamagedGoods` (move/decrement)
- `reconcileStockTake` (adjust)

Concurrent transactions on the same stock row queue rather than racing. Postgres's default `READ COMMITTED` isolation is sufficient given explicit `FOR UPDATE` locks.

### 5.9 Time Zone Handling

```typescript
// src/lib/time.ts
export const BUSINESS_TIMEZONE = 'Africa/Kampala' as const

import { fromZonedTime, toZonedTime } from 'date-fns-tz'

// Convert a local business-day boundary to UTC for queries
export function startOfBusinessDay(date: Date): Date {
  const local = toZonedTime(date, BUSINESS_TIMEZONE)
  local.setHours(0, 0, 0, 0)
  return fromZonedTime(local, BUSINESS_TIMEZONE)
}

export function endOfBusinessDay(date: Date): Date {
  const local = toZonedTime(date, BUSINESS_TIMEZONE)
  local.setHours(23, 59, 59, 999)
  return fromZonedTime(local, BUSINESS_TIMEZONE)
}
```

All daily/weekly/monthly report endpoints use these helpers to compute boundaries. UI date pickers display in `Africa/Kampala`.

### 5.10 Soft Delete Pattern

Reference entities (`Customer`, `Supplier`, `Shop`, `BankAccount`, `User`, `TransactionCategory`) carry a nullable `deletedAt` column. Reads filter `deletedAt IS NULL` by default; admin views can opt in to seeing tombstones.

```typescript
// Drizzle helper applied to reference-entity queries
const activeOnly = isNull(table.deletedAt)
```

Transactional records (sales, transfers, transactions, stock takes, payments) **never** carry `deletedAt` — corrections happen via reversal entries.

### 5.11 Document Number Generation

Each document type has a dedicated Postgres sequence reset annually via a small `document_number` helper. Numbers are issued inside the same transaction that creates the document, so a rolled-back transaction does NOT consume a number — sequences are advisory only; the canonical number is read back from the row.

```sql
-- migration: per-prefix sequences with year reset
CREATE TABLE document_numbers (
  prefix TEXT NOT NULL,
  year   INT  NOT NULL,
  next   INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (prefix, year)
);
```

```typescript
// src/lib/document-numbers.ts
export async function nextDocumentNumber(
  tx: Transaction,
  prefix: 'SR' | 'RCV' | 'TRF' | 'SALE' | 'PAY' | 'RET' | 'STR-RET' | 'STK',
  pad = 4,
): Promise<string> {
  const year = new Date().getFullYear()
  const [row] = await tx.execute(sql`
    INSERT INTO document_numbers (prefix, year, next)
    VALUES (${prefix}, ${year}, 2)
    ON CONFLICT (prefix, year) DO UPDATE SET next = document_numbers.next + 1
    RETURNING next - 1 AS issued
  `)
  return `${prefix}-${year}-${String(row.issued).padStart(pad, '0')}`
}
```

The `INSERT … ON CONFLICT … RETURNING` pattern uses row locking for serial issuance under concurrent writes.

### 5.12 PDF Document Generation

Receipts, transfer slips, customer statements, and stock-take worksheets render as PDFs on demand using **`@react-pdf/renderer`** inside a server function. PDFs are streamed to the client; nothing is stored server-side.

```typescript
// src/lib/pdf/receipt.tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export const SaleReceipt = ({ sale }: { sale: ShopSaleWithItems }) => (
  <Document>
    <Page size="A6" style={styles.page}>
      <Text style={styles.title}>{sale.shop.name}</Text>
      <Text>Receipt: {sale.documentNumber}</Text>
      <Text>{formatBusinessDate(sale.saleDate)}</Text>
      {sale.items.map(item => (
        <View key={item.id} style={styles.row}>
          <Text>{item.productName} × {item.quantity}</Text>
          <Text>{formatUgx(item.totalPriceUgx)}</Text>
        </View>
      ))}
      <Text style={styles.total}>Total: {formatUgx(sale.totalAmount)}</Text>
      <Text>Payment: {sale.paymentMethod}</Text>
    </Page>
  </Document>
)
```

```typescript
// src/routes/api/receipts/[saleId].ts
export const GET = createServerFn().handler(async ({ params, request }) => {
  const sale = await loadSaleWithItems(params.saleId)
  await assertCanRead(request, sale)
  const stream = await renderToStream(<SaleReceipt sale={sale} />)
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${sale.documentNumber}.pdf"`,
    },
  })
})
```

### 5.13 Listing & Pagination Contract

A shared helper produces consistent cursor-paginated responses. Cursors are opaque base64 strings encoding `{ id, sortValue }`.

```typescript
// src/lib/pagination.ts
export interface PaginationOptions {
  cursor?: string
  limit?: number    // default 50, max 200
  sort?: string     // "field:asc" | "field:desc"
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
}

export async function paginate<T>(
  query: PgSelect,
  opts: PaginationOptions,
  cursorColumn: PgColumn,
): Promise<PaginatedResult<T>> {
  const limit = Math.min(opts.limit ?? 50, 200)
  const decoded = opts.cursor ? decodeCursor(opts.cursor) : null

  const rows = await query
    .where(decoded ? lt(cursorColumn, decoded.sortValue) : undefined)
    .orderBy(desc(cursorColumn))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore
    ? encodeCursor({ id: items.at(-1)!.id, sortValue: items.at(-1)![cursorColumn.name] })
    : null

  return { items: items as T[], nextCursor }
}
```

Total counts are not returned by default. An optional `?countHint=true` parameter calls `pg_class.reltuples` for an approximate count on tables larger than 10k rows.

### 5.14 Notifications

A lightweight notification system writes to a `notifications` table (per-user inbox) and optionally fans out to email via Resend.

```
Notification
├── id: UUID
├── userId: FK -> User
├── kind: TEXT (e.g., "low_stock", "credit_overdue", "stock_take_discrepancy")
├── title: TEXT
├── body: TEXT
├── entityType: TEXT (nullable)
├── entityId: TEXT (nullable)
├── readAt: TIMESTAMP (nullable)
├── createdAt: TIMESTAMP
```

Triggers fire via:
- **Inline emit** at the end of the originating server function (e.g., `recordSale` checks low-stock threshold after decrementing)
- **Scheduled cron** (Cloudflare Workers cron triggers, every 15 min) for time-based checks: overdue credit sales, replication slot lag

```typescript
// src/server/notifications/emit.ts
export async function emitNotification(
  tx: Transaction,
  kind: string,
  audience: { roles?: Role[]; userIds?: string[] },
  payload: { title: string; body: string; entityType?: string; entityId?: string },
) {
  const recipients = await resolveAudience(tx, audience)
  for (const userId of recipients) {
    await tx.insert(notifications).values({
      id: crypto.randomUUID(),
      userId,
      kind,
      ...payload,
      createdAt: new Date(),
    })
  }
  // Email fan-out for high-severity kinds (queue, don't block)
  if (HIGH_SEVERITY.has(kind)) await queueEmail(recipients, payload)
}
```

Thresholds (low-stock = 5, aging = 30 days, discrepancy = 10%) are stored in a `system_settings` key/value table so they can be tuned without redeploy.

### 5.15 Excel Import (Historical Data)

The import path is a separate `src/server/functions/admin/importExcel.ts` server function gated to Admin. The flow:

1. **Upload** — multipart form posts the `.xlsx` to a server function. Parsed in-memory with `xlsx` (SheetJS).
2. **Preview** — server returns a parsed-row preview keyed by sheet name; client renders a column-mapping UI.
3. **Commit** — second call posts the confirmed mapping. Inside one transaction:
   - For each route sheet, compute `externalRef = sha256(filename + sheetName)`.
   - Skip if a `SupplyRoute` with that `externalRef` already exists (idempotent re-run).
   - Insert `SupplyRoute` (status `completed`), its items, and its expenses.
   - Write a single `AuditLog` row with `action = "import.excel"`, `metadata = { filename, sheetName, rowsImported }`.
4. **No ledger entries** for historical routes. Opening balances are posted via a separate one-time `Owner's Equity` journal (`DR Cash/Bank/Inventory… / CR Owner's Equity`).

The import server function is **not exposed via Electric sync** and lives behind an Admin-only route at `/api/admin/import-excel`.

---

## 6. Authentication & Authorization

### 6.1 Auth Flow

```
1. Admin creates user via invite
       │
       ▼
2. User receives email with invite link
       │
       ▼
3. User sets password + confirms email
       │
       ▼
4. User signs in → Better Auth issues JWT
       │
       ▼
5. JWT contains: { userId, role, shopId? }
       │
       ├──→ Server functions: JWT verified, role checked
       └──→ Electric proxy: JWT used to filter shapes
```

### 6.2 JWT Payload

```typescript
interface JWTPayload {
  sub: string          // userId
  role: 'admin' | 'supervisor' | 'sales'
  shopId?: string      // only for sales personnel
  email: string
  iat: number
  exp: number
}
```

### 6.3 Role-Based Route Protection

```typescript
// src/server/middleware/rbac.ts

const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/supply/*':    ['admin', 'supervisor'],
  '/store/*':     ['admin', 'supervisor'],
  '/shop/*':      ['admin', 'supervisor', 'sales'],
  '/reports/*':   ['admin', 'supervisor'],
  '/settings/*':  ['admin'],
}

export async function requireRole(request: Request, roles: Role[]) {
  const jwt = await verifyJWT(request)
  if (!roles.includes(jwt.role)) {
    throw new Error('Forbidden')
  }
  return jwt
}
```

### 6.4 Invite-Only Registration

```typescript
// Admin creates an invite → system sends email with token
// User clicks link → sets password → account confirmed
// No self-registration

export const inviteUser = createServerFn()
  .handler(async ({ data, request }) => {
    await requireRole(request, ['admin'])

    const invite = await auth.admin.createUser({
      email: data.email,
      role: data.role,
      shopId: data.shopId,  // required for sales role
      sendInviteEmail: true,
    })

    return invite
  })
```

---

## 7. Project Structure

```
src/
├── lib/
│   ├── accounting/
│   │   ├── ledger.ts              — postJournalEntry(), reverseJournalEntry()
│   │   ├── ledger-queries.ts      — balance queries from ledger
│   │   ├── auto-post.ts           — automated journal entry templates
│   │   └── categories.ts          — chart of accounts helpers
│   ├── auth/
│   │   ├── auth.ts                — Better Auth instance config
│   │   ├── auth-client.ts         — client-side auth utilities
│   │   └── jwt.ts                 — JWT helpers
│   ├── currency/
│   │   └── conversion.ts          — RMB/BHT → USD → UGX helpers
│   ├── time.ts                    — BUSINESS_TIMEZONE, day boundaries
│   ├── document-numbers.ts        — per-prefix sequential issuers
│   ├── pagination.ts              — cursor-based listing helper
│   ├── pdf/
│   │   ├── receipt.tsx            — SaleReceipt component
│   │   ├── transfer-slip.tsx
│   │   ├── customer-statement.tsx
│   │   └── stock-take-sheet.tsx
│   └── utils.ts                   — cn(), BigNumber formatters
│
├── db/
│   ├── schema/
│   │   ├── suppliers.ts
│   │   ├── supply-routes.ts
│   │   ├── store.ts
│   │   ├── shops.ts
│   │   ├── store-stock.ts
│   │   ├── shop-stock.ts          — includes damaged-goods sub-bucket
│   │   ├── transfers.ts
│   │   ├── sales.ts               — shopSales + paymentStatus, outstandingBalance
│   │   ├── customers.ts           — Customer, CustomerPayment, CustomerPaymentApplication
│   │   ├── returns.ts             — ShopReturn, StoreReturn (+ items)
│   │   ├── stock-takes.ts
│   │   ├── expenses.ts
│   │   ├── transactions.ts        — ledger entries (incl. reversal links)
│   │   ├── transaction-categories.ts
│   │   ├── audit-logs.ts          — append-only audit trail
│   │   ├── idempotency-keys.ts    — request dedup
│   │   ├── document-numbers.ts    — per-prefix yearly counters
│   │   ├── notifications.ts       — per-user inbox
│   │   ├── system-settings.ts     — tunable thresholds (low-stock, aging, etc.)
│   │   ├── bank-accounts.ts
│   │   └── users.ts               — Better Auth user + role + shopId
│   ├── index.ts                   — Drizzle instance (Neon HTTP driver)
│   └── seed.ts                    — seed transaction categories
│
├── db-collections/
│   ├── store-stock.ts             — ElectricSQL-backed collection
│   ├── shop-stock.ts
│   ├── shop-sales.ts
│   ├── transfers.ts
│   ├── suppliers.ts
│   ├── supply-routes.ts
│   └── index.ts                   — collection registry
│
├── server/
│   ├── functions/
│   │   ├── supply/                — supply route CRUD + items + expenses
│   │   ├── store/                 — receiving, transfers, stock mgmt
│   │   ├── shop/                  — sales recording, stock
│   │   ├── accounting/            — journal entries, settlements, fund transfers
│   │   ├── stocktake/             — stock taking + reconciliation
│   │   └── admin/                 — user invites, suppliers, bank accounts
│   └── middleware/
│       ├── auth.ts
│       ├── rbac.ts
│       └── validation.ts
│
├── components/
│   ├── ui/                        — shadcn components
│   └── shared/
│       ├── data-table.tsx         — reusable TanStack Table wrapper
│       ├── currency-input.tsx     — UGX formatted input
│       ├── product-autocomplete.tsx — freeform with past name suggestions
│       └── price-display.tsx      — BigNumber → formatted UGX
│
├── routes/
│   ├── __root.tsx                 — root layout, auth guard
│   ├── login.tsx                  — sign in page
│   ├── invite.$token.tsx          — accept invite + set password
│   ├── supply/
│   │   ├── index.tsx              — supply routes list
│   │   ├── $routeId.tsx           — route detail (items + expenses)
│   │   └── suppliers.tsx          — supplier management
│   ├── store/
│   │   ├── index.tsx              — store stock overview
│   │   ├── receiving.tsx          — receive goods from supply route
│   │   ├── transfers.tsx          — transfers to shops
│   │   └── stock-take.tsx         — stock taking
│   ├── shop/
│   │   ├── index.tsx              — shop stock + quick sale
│   │   ├── sales.tsx              — sales history
│   │   ├── new-sale.tsx           — record sale form
│   │   └── stock-take.tsx         — shop stock taking
│   ├── reports/
│   │   ├── profit-loss.tsx        — P&L statement
│   │   ├── balance-sheet.tsx      — balance sheet
│   │   ├── cash-position.tsx      — cash + bank balances
│   │   ├── inter-branch.tsx       — Due from/to balances
│   │   ├── route-profit.tsx       — per-route profitability
│   │   ├── shop-performance.tsx   — per-shop comparison
│   │   ├── losses.tsx             — loss detection dashboard
│   │   └── ledger.tsx             — general ledger view
│   ├── settings/
│   │   ├── users.tsx              — user management + invites
│   │   ├── shops.tsx              — shop management
│   │   ├── bank-accounts.tsx      — bank account management
│   │   └── index.tsx              — general settings
│   └── api/
│       ├── auth/
│       │   └── $.ts               — Better Auth handler
│       └── electric-proxy/
│           └── [table].ts         — authenticated Electric shape proxy
│
├── env.ts                         — T3Env config
├── router.tsx                     — TanStack Router setup
└── styles.css                     — Tailwind globals
```

---

## 8. Deployment Architecture

### 8.1 Infrastructure

| Component | Host | Access |
|-----------|------|--------|
| **App** | Cloudflare Workers | Public URL |
| **Database** | Neon Postgres | `DATABASE_URL` env var |
| **ElectricSQL** | Hetzner VPS | `ssh node1`, Docker Compose |
| **DNS / CDN** | Cloudflare | Manages domain + SSL |

### 8.2 ElectricSQL Docker Compose

File: `deploy/electric/docker-compose.yml`

```yaml
services:
  electric:
    image: electricsql/electric:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      ELECTRIC_INSECURE: "false"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

The `DATABASE_URL` points to Neon Postgres with logical replication enabled. Environment variables are managed via a `.env` file on `node1` (not committed to git).

### 8.3 Neon Postgres Setup

1. Create a Neon project (free tier)
2. Enable logical replication (Neon dashboard → Settings → Logical Replication)
3. Create a database role with `REPLICATION` attribute
4. Use the direct connection string (not pooled) for ElectricSQL
5. Use the pooled HTTP connection string for Cloudflare Workers (via `@neondatabase/serverless`)

---

## 9. CI/CD

### 9.1 App Deployment (Cloudflare Workers)

Triggers on push to `main` for any source code change.

```yaml
# .github/workflows/deploy-app.yml
name: Deploy App
on:
  push:
    branches: [main]
    paths-ignore:
      - 'deploy/**'
      - '*.md'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

### 9.2 ElectricSQL Deployment (Hetzner)

Triggers **only** when the compose file changes.

```yaml
# .github/workflows/deploy-electric.yml
name: Deploy ElectricSQL
on:
  push:
    branches: [main]
    paths:
      - 'deploy/electric/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/inventory/electric
            docker compose pull
            docker compose up -d
            docker compose ps
```

### 9.3 Database Migrations

Run manually or via CI before app deployment:

```bash
npx drizzle-kit generate   # generate migration SQL
npx drizzle-kit migrate    # apply to Neon
```

---

## 10. Environment Variables

### 10.1 Cloudflare Workers (wrangler.jsonc)

```jsonc
{
  "vars": {
    "ELECTRIC_URL": "https://electric.yourdomain.com",
    "BETTER_AUTH_URL": "https://app.yourdomain.com"
  }
  // Secrets set via: wrangler secret put <NAME>
  // DATABASE_URL, BETTER_AUTH_SECRET, SENTRY_DSN
}
```

### 10.2 Hetzner (deploy/electric/.env)

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/inventory?sslmode=require
```

Not committed to git. Managed manually on the server or via CI secrets.

---

## 11. Responsive Design

The app serves all three modules (Supply, Store, Shop) from a single responsive UI:

| Route Group | Primary Device | Layout Strategy |
|-------------|---------------|-----------------|
| `/supply/*` | Desktop | Full-width tables, multi-column forms |
| `/store/*` | Desktop | Data tables, transfer workflows |
| `/shop/*` | Desktop + Tablet | Responsive — optimized for tablet POS use |
| `/reports/*` | Desktop | Wide charts, full tables |

Implementation approach:
- Tailwind responsive utilities (`sm:`, `md:`, `lg:`)
- Flexbox + CSS Grid for layout
- Conditional component rendering based on screen size where needed
- Touch-friendly inputs and buttons for tablet shop view

---

## 12. Security Considerations

### 12.1 Data Access

- **Server functions** verify JWT and role before every mutation
- **Electric proxy** injects `WHERE` clauses based on JWT claims — sales personnel can only sync their own shop's data
- **No direct client-to-database access** — all writes go through server functions

### 12.2 Financial Integrity

- **Journal entries are immutable** — corrections are made via reversal entries (`reverseJournalEntry()`), not edits
- **All monetary operations use BigNumber.js** — no floating-point arithmetic
- **Compound journal entries must balance** — the ledger engine rejects unbalanced entries
- **Stock adjustments require approval** — only admin/supervisor can reconcile stock takes
- **Stock rows locked `FOR UPDATE`** during sales/transfers to prevent concurrent oversell
- **Idempotency keys** on all mutating endpoints prevent duplicate writes from client retries

### 12.3 Audit & Append-Only Tables

- **`audit_logs`** is created with `INSERT`-only privileges granted to the application role; `UPDATE` and `DELETE` are revoked at the Postgres level. Same applies to the `transactions` table — the application role can only insert.
- Every sensitive operation writes an `AuditLog` row in the same transaction as the change (see §5.6).

### 12.4 Infrastructure

- **Neon Postgres** — encrypted at rest and in transit, managed backups, PITR enabled
- **ElectricSQL** — proxied through the app with auth, not exposed directly to the internet
- **Cloudflare Workers** — edge-deployed, DDoS protection built-in
- **Environment secrets** — stored in Cloudflare secrets and Hetzner `.env`, never in git

---

## 13. Backup & Disaster Recovery

| Concern | Approach | Target |
|---------|----------|--------|
| Database backup | Neon PITR (built-in) | RPO ≤ 5 min |
| Off-site export | Weekly `pg_dump` to Cloudflare R2 | Belt & braces |
| App recovery | Re-deploy from CI on push | RTO ≤ 1 hour |
| Sync recovery | `docker compose up -d` on `node1` (stateless) | RTO ≤ 15 min |
| Replication slot health | Monitor Neon WAL slot lag; alert > 1 GB | Prevent WAL bloat |

The ledger and `audit_logs` are the system of record — both are retained indefinitely. Reference-entity soft deletes are also retained; physical deletion is never performed.

### 13.1 Off-site Export Job

A scheduled GitHub Actions workflow runs `pg_dump --no-owner --schema=public` weekly, encrypts the dump with `age`, and uploads to a private R2 bucket. Retains 12 weekly snapshots.

### 13.2 Restore Drill

Quarterly: restore the latest export to a Neon branch, run a sanity-check script (trial balance, ledger row count, sample report), then drop the branch. Document time-to-restore in a `runbook/restore.md` file.
