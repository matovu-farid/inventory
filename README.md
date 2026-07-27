# Inventory and Trade Management System

A multi-module inventory and trade management platform for a clothing import / retail business. Tracks the full lifecycle of goods, from international or local procurement, through warehousing, to retail sales across multiple shops. Double-entry bookkeeping with a shared ledger keeps the books honest and surfaces loss at every stage.

The system is one codebase serving three role-based front ends that share a common database and accounting engine.

## Modules

| Module | Primary users | Core responsibility |
| --- | --- | --- |
| **Supply** | Admin, Supervisor | Procurement, supplier management, import-cost tracking (RMB to USD to UGX) |
| **Store** | Admin, Supervisor | Warehouse management, stock control, distribution to shops |
| **Shop** | Sales personnel, Supervisor | Retail point of sale, pricing, daily accounts |

## What it does

- **Supply chain visibility.** From a buying trip in China (item-level purchases, freight, customs, insurance) to warehouse receipt to shop sale, every movement creates a journal entry. Loss is detectable at any point in the chain.
- **Point of sale.** A `/pos` route for fast retail checkout with minimum-price enforcement and daily X / Z reports.
- **Stock control.** Stock-in, stock-out, restock workflows, stock-takes, audit-logged variants by article number.
- **Multi-currency procurement.** Records purchases in RMB, converts to USD then UGX with the trip's actual rates, so cost-of-goods reflects reality and not an averaged guess.
- **Audit trail.** Every mutation goes through the server, gets validated, and is logged. Settings has a viewer.
- **User management.** Email-invite onboarding, photo upload via signed token URL, role-based access.

## Tech stack

- **Framework.** TanStack Start (full-stack React) with TanStack Router (file-based) and TanStack Start server functions.
- **Frontend state.** TanStack Query and TanStack DB collections for reactive, real-time data. TanStack Form for input.
- **UI.** Tailwind CSS v4 with shadcn/ui and Radix UI primitives.
- **Database.** Neon Postgres with Drizzle ORM. Migrations checked into `drizzle/`.
- **Deployment.** Cloudflare Workers via Wrangler. A scheduled worker runs hourly cron jobs (email digests, reminders).
- **Auth.** Better Auth with role-based access control and email-verified sign up.
- **Emails.** Resend with React Email templates. Calls can be gated with `MOCK_EMAILS` env in dev.
- **Observability.** Sentry on the TanStack Start server.
- **Testing.** Vitest unit tests, Cypress E2E with seeded fixtures.

See [`TECHNICAL.md`](./TECHNICAL.md) for the architecture diagram and [`REQUIREMENTS.md`](./REQUIREMENTS.md) for the business model and accounting rules.

## Origin

The business currently tracks operations in `gross_profit.xlsx`, a spreadsheet spanning 47 buying-trip routes from 2011 to 2026. The schema and accounting rules in this codebase are derived directly from that spreadsheet, so the system can be adopted without losing prior history.

## Getting started

```bash
pnpm install
pnpm db:push       # apply Drizzle schema to your dev DB
pnpm db:seed       # optional: seed dev data
pnpm dev           # start the TanStack Start dev server on :3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite + TanStack Start dev server, Sentry instrumented |
| `pnpm build` | Production build for Cloudflare Workers |
| `pnpm deploy` | Build and deploy to Cloudflare with Wrangler |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Cypress E2E suite |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` | Prettier check |
| `pnpm check` | Prettier write plus eslint fix |
| `pnpm db:studio` | Drizzle Studio for browsing data |
| `pnpm backfill:audit` | One-off script to backfill audit logs |
| `pnpm backfill:variants` | One-off script to backfill item variants |

## Status

Active development. Supply, Store, and Shop modules are functional. Currently hardening the audit / restock flows and email-notification cadence.
