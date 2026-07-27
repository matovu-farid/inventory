# Project Context Index

**Generated:** 2026-05-25 by /kanban-init --refresh-context
**Trust rule:** if any entry here disagrees with the code, trust the code.

## Stack

- Runtime: Node.js (via Vite dev / Cloudflare Workers prod) — see `package.json:9` (`vite dev`) and `package.json:19` (`wrangler deploy`)
- Language: TypeScript @ ^5.7.2 (source: `package.json:99`)
- Framework: TanStack Start @ ^1.167.65 + TanStack Router @ ^1.169.2 + React @ ^19.2.0 (source: `package.json:46-50,66`)
- Data layer: Drizzle ORM @ ^0.45.1 against Neon Postgres (`@neondatabase/serverless`); driver switch in `src/db/index.ts:13-25`
- Client cache: TanStack Query @ ^5.100.9 + TanStack DB @ ^0.1.83 (source: `package.json:41-45`)
- Auth: Better Auth @ ^1.5.3 (source: `package.json:53`, instance `src/lib/auth.ts`)
- UI: shadcn/ui + Radix + Tailwind CSS v4 (source: `package.json:38,65,71`, `components.json`)
- Money math: bignumber.js @ ^11 (source: `package.json:54`) — all UGX/FX work uses `BigNumber`
- Test runners: Vitest (unit/integration) + Cypress (e2e) — `package.json:12-14`
- Lint/format: ESLint flat config (`eslint.config.js`) + Prettier (`prettier.config.js`)
- Deploy target: Cloudflare Workers (`wrangler.jsonc`); ElectricSQL sync on Hetzner (`ssh node1`)
- Commands: see `.claude/kanban.json` → `scopes.app.typecheck` and `scopes.app.test`. Build/lint/format are package.json scripts (`build`, `lint`, `format`, `check`) — not modeled in kanban.json.

## File layout

- `src/routes/` — TanStack Router file-based routes; `routeTree.gen.ts` is auto-generated, never edit by hand
- `src/routes/__root.tsx` — root layout, providers, sidebar
- `src/routes/{store,shop,supply}/` — three business modules (warehouse, retail, procurement)
- `src/routes/reports/` — finance reports: `ledger.tsx`, X-report `x.tsx`, Z-report `z.tsx` + `z.$id.tsx`
- `src/routes/settings/` — admin pages: users, audit-log, shops, item categories, notifications
- `src/routes/api/auth/` — only routes allowed to import server-only modules directly (see `eslint.config.js:31-37`)
- `src/server/functions/` — all server mutations/queries via `createServerFn` (44 files across `accounting/`, `admin/`, `audit/`, `auth/`, `customers/`, `notifications/`, `prereqs/`, `products/`, `shop/`, `store/`, `supply/`)
- `src/server/functions/**/-internals.ts` — server-only helpers, banned from client imports (see `eslint.config.js:40-45`)
- `src/server/middleware/` — `auth.ts` (session), `rbac.ts` (role + IP gate), `idempotency.ts`, `ip-allowlist.ts`, `audit.ts`
- `src/server/audit/` — audit-log capture (`audit-store.ts` builders, called from functions)
- `src/server/scheduled/` — cron-style jobs for Workers (low-stock digest, etc.)
- `src/server/worker.ts` — Cloudflare Worker entry
- `src/db/schema/` — 23 per-table schema files re-exported from `src/db/schema/index.ts`; `src/db/schema.ts` is a one-line re-export consumed by drizzle-kit
- `src/db/index.ts` — driver factory that picks Neon HTTP vs `pg.Pool` based on `DATABASE_URL`
- `src/db/seed.ts` — seed script invoked via `pnpm db:seed`
- `src/lib/accounting/` — `ledger.ts` (postJournalEntry), `ledger-queries.ts`, `reversal.ts`
- `src/lib/currency/conversion.ts` — RMB/USD/UGX FX math
- `src/lib/format.ts` — `formatUgx` / `formatUgxTotal` + `formatDate` helpers (UGX rounding lives here)
- `src/lib/help-dictionary.ts` — central InfoTip term dictionary (`HelpKey` / `HelpEntry`)
- `src/lib/{pos,prerequisites,pdf,notifications,emails,images,s3,offline,credit}/` — feature-scoped utilities
- `src/components/ui/` — shadcn primitives plus `field-label.tsx`, `info-tip.tsx`, `money-input.tsx`
- `src/components/{products,pos,audit,shops,transfers,reports,opening-balance,prerequisites,notifications,auth}/` — feature components
- `src/__tests__/` — Vitest suites (~50 files, e.g. `accounting-scenarios.test.ts`, `journal-reversal.test.ts`)
- `cypress/e2e/` — 13 e2e spec files covering auth, full workflow, POS, audit log, item categories
- `drizzle/` — generated SQL migrations `0001…0009_*.sql`
- `scripts/` — one-off ops scripts (e.g. `backfill-audit-logs.ts`)
- `instrument.server.mjs` — Sentry server instrumentation loaded via `--import`
- `wrangler.jsonc` — Cloudflare Workers deployment config
- `drizzle.config.ts` — drizzle-kit config; reads `DATABASE_URL` from `.env.local` / `.env`
- `REQUIREMENTS.md` / `TECHNICAL.md` — long-form business + architecture docs
- `gross_profit.xlsx` — client's source Excel (47 routes, 2011–2026) being migrated into this system

## Conventions

- All server mutations go through `createServerFn` — example: `src/server/functions/products/products.ts:14`. Client code (`src/routes/**`, `src/components/**`) is forbidden from importing `#/db` or `*-internals*` (enforced by `eslint.config.js:40-58`).
- Auth gate is `requireSession()` then `requireRole(session, [...])` at the top of every handler (example: `src/server/functions/products/products.ts:17-18`; ≥4 files: products, supply/routes, store/receiving, shop/sales).
- Money stored as Postgres `numeric(15,2)` and manipulated with `BigNumber` (example: `src/db/schema/transactions.ts:49`; 5 schema files: transactions, customers, returns, supply-routes, sales).
- Every UGX display value flows through `formatUgx` / `formatUgxTotal` — never raw `toFixed`/`toFormat` for UGX in UI (example: `src/lib/format.ts:55`; 94 call sites across `src/`).
- Every form field, table header, and KPI label renders an InfoTip via `<FieldLabel help="…">` or inline `<InfoTip term="…">`; description must exist in `src/lib/help-dictionary.ts` (example: `src/components/ui/field-label.tsx:12`; canonical reference pages `src/routes/store/index.tsx`, `src/routes/store/receiving.tsx`, `src/routes/shop/index.tsx`).
- Journal entries post via `postJournalEntry(tx, …)` inside a `db.transaction` — debits must equal credits or it throws (example: `src/lib/accounting/ledger.ts:32`; callers: `src/server/functions/{customers/payments,shop/settlement,admin/opening-balance,accounting/fund-transfers,shop/stock-take}.ts`).
- Audit log is recorded inside the same DB transaction as the mutation it describes (example: `src/server/audit/audit-store.ts:8` — `recordAuditLog(tx, params)`).
- Idempotency is opt-in via `withIdempotency(store, key, handler)` (example: `src/server/middleware/idempotency.ts:9`).
- Path alias `#/*` resolves to `src/*` — defined in `package.json:5-7` and used throughout.
- Never disable a lint rule or use `eslint-disable` / `@ts-ignore` / `@ts-expect-error`; fix the upstream code (policy file: `/Users/faridmatovu/.claude/projects/-Users-faridmatovu-projects-inventory/memory/feedback_no_disable_lint.md`; ESLint has zero disables across `src/`).
- Damaged-goods tracking is out of scope — units arrive in sellable shop stock; below-min sales require a mandatory `belowMinimumReason` on `shop_sale_items` (policy: `/Users/faridmatovu/.claude/projects/-Users-faridmatovu-projects-inventory/memory/client_decisions.md`).
- Schema files are split per-table under `src/db/schema/` and re-exported from `src/db/schema/index.ts`; `src/db/schema.ts` (one-liner) is what drizzle-kit reads.

## Architecture

Single TanStack Start app deployed to Cloudflare Workers, backed by Neon Postgres with self-hosted ElectricSQL on Hetzner for real-time sync to the browser. Requests flow: browser route → either a TanStack DB collection (read-mostly, synced via Electric) or a `createServerFn` call (mutations + privileged reads). Every server function runs `requireSession` → `requireRole` → optional IP allowlist before touching the DB. Mutations open a `db.transaction`, mutate domain tables, call `postJournalEntry` for any financial side-effect (double-entry, debits=credits enforced), and write an `auditLogs` row inside the same tx. Three business modules (Supply, Store, Shop) share one schema, ledger, and auth; roles (admin, supervisor, sales) partition access. Currency chain RMB→USD→UGX uses `BigNumber` end-to-end; UGX values are floored to 50 shillings only at display time.

## Domain glossary

- **Supply / Route** — A buying trip (typically to China). Tracks items purchased + freight/customs/tax expenses. Routes live in `supply_routes`.
- **Store** — The single central warehouse. Receives goods from supply routes, distributes to shops.
- **Shop** — A retail location (1..many). Sells to walk-in or credit customers; uses POS.
- **Article number** — Stable product code used as the natural key across `products`, audit logs, and the Excel source.
- **Product / Color / Variant** — Three-layer catalog: a product has colors (with image), and size×color forms a stock-keeping variant.
- **Item category** — Optional grouping above products (added in migration `0009_item_categories.sql`).
- **Transfer** — Stock movement from store → shop; reversed by a return.
- **Receiving** — The act of admitting a supply route's goods into store stock; triggers the landed-cost journal.
- **Below-minimum sale** — Sale below the configured minimum unit price; requires admin/supervisor approval and a mandatory `belowMinimumReason`.
- **Shift closure / Z-report** — End-of-shift cash count + sales reconciliation; X-report is the mid-shift preview.
- **Opening balance** — Snapshot used to seed ledger + stock when migrating from Excel.
- **Journal group** — A set of `transactions` rows sharing one `journalGroupId`; total debits must equal total credits.
- **Reversal** — A balanced inverse journal group referenced by `reversesJournalGroupId` / `reversedByJournalGroupId`.
- **Landed cost** — UGX cost of a unit after freight/customs/tax allocation across a supply route.
- **Prerequisites** — Setup gates (shop exists, supplier exists, route ready) checked before receiving/sales flows; logic in `src/lib/prerequisites/derive.ts`.
- **Idempotency key** — Client-provided token cached in `idempotency_keys` so a retried mutation returns the same response.
- **InfoTip / help-dictionary** — Mandatory inline help mechanism for every label, header, and KPI card; backed by `src/lib/help-dictionary.ts`.
- **UGX floor-50 rule** — UGX values are floored to the nearest 50 shillings on display only; storage stays at `numeric(15,2)`.
- **Customer (credit debtor)** — Customer entities only exist for trust-based credit sales; cash sales are anonymous.
- **Audit log** — Append-only `audit_logs` rows written inside the same tx as the mutation they describe.

## Entry points

- `src/routes/__root.tsx` — start here to understand layout, providers, and sidebar wiring
- `src/db/schema/index.ts` — map of all domain tables; follow re-exports to per-table files
- `src/server/functions/` — start here when changing server behavior or adding a new mutation
- `src/lib/accounting/ledger.ts` — start here for anything that posts to the ledger (debits/credits, reversals)
- `src/lib/help-dictionary.ts` — start here when adding a new form/table/KPI to register the InfoTip term
- `cypress/e2e/02-full-workflow.cy.ts` — end-to-end happy path covering supply → store → shop → ledger
