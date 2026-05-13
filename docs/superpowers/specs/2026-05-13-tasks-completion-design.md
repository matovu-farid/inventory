# Design — Finishing docs/tasks.md (camera/QR, X/Z reports, mobile verification)

**Date:** 2026-05-13
**Branch:** `feat/mobile-pos`
**Status:** Draft

## Background

`docs/tasks.md` has five items. Three are already shipped on this branch:

| # | Task | Status | Evidence |
|---|---|---|---|
| 1 | Mobile UI for salesman | Mostly done | `/pos` route + responsive admin sweep (`0299bb3`, `172af1d`, `d186d58`, `77e40c7`, `b5cd293`) |
| 2 | Admin IP allowlist, block lower roles from unfamiliar IPs | Done | `fa208a0` (`src/lib/ip-allowlist.ts`, `src/server/middleware/ip-allowlist.ts`) |
| 3 | POS thermal receipt printing | Done | `2f0d6d1` (`src/lib/pos/print-receipt.ts`, `src/lib/pdf/receipt-html.ts`) |
| 4 | Direct camera on mobile + QR upload from desktop | Not done | `ImageUploader` is file-input only |
| 5 | X and Z reports (manager+) | Not done | `/reports` only exposes financial dashboard + ledger |

This spec covers the remaining work plus a small mobile verification pass.

## Decisions (made autonomously per user direction)

- **X/Z semantics:** classical POS — X is a read-only running snapshot, Z closes the period, is sequentially numbered, and is immutable once issued. Reason: the business value of these reports is cash-drawer accountability; without a closing cut-off they're just date-filtered dashboards we already have.
- **Shift granularity:** per-shop, per-Z (no explicit shift-open step). A "shift" is the window between the previous Z and the next Z for a shop. First Z for a shop covers all sales up to that point.
- **Cash drawer reconciliation:** the operator (admin/supervisor) enters the *declared* cash count when closing Z. System computes *expected* from sales and reports variance.
- **RBAC:** view X and Z and history — `admin` + `supervisor`. Close Z — `admin` + `supervisor` (matches manager+ from the task). `sales` role does not see these.
- **Mobile camera:** add `capture="environment"` to existing `ImageUploader` file input. Mobile Safari/Chrome will prefer the rear camera. Gallery still accessible.
- **Desktop QR flow:** signed, single-use token table; desktop creates a token, renders a QR encoding `/upload-photo/{token}`; mobile scans, hits a public route, takes/uploads photo via existing S3 presign; desktop polls a small status endpoint every 2s until the token is consumed, then invalidates.

---

## Architecture

### Task 5 — X and Z reports

**New DB tables (`src/db/schema/shift-closures.ts`):**

```ts
shiftClosures
  id           uuid PK
  shopId       uuid not null → shops
  closureNumber int not null          // monotonically increasing per shop
  periodStart  timestamptz not null   // previous Z's closedAt (or epoch for first)
  closedAt     timestamptz not null
  closedBy     text not null → user
  openingCashUgx       numeric(15,2)  // carried forward from previous Z, 0 for first
  declaredCashUgx      numeric(15,2)  // operator-entered drawer count
  expectedCashUgx      numeric(15,2)  // computed from sales (cash-only)
  varianceUgx          numeric(15,2)  // declared - expected
  grossSalesUgx        numeric(15,2)  // sum of all sale totals in period
  cashSalesUgx         numeric(15,2)
  bankSalesUgx         numeric(15,2)
  creditSalesUgx       numeric(15,2)
  salesCount           int
  notes                text nullable
  createdAt    timestamptz default now
```

Index: `(shopId, closureNumber desc)`, `(shopId, closedAt desc)`.

**New server functions (`src/server/functions/accounting/shift-reports.ts`):**

- `getXReport({ shopId })` → reads previous Z's `closedAt` (or null), aggregates all sales for `shopId` since that timestamp, returns the same shape as a Z but without persistence. Includes per-clerk breakdown.
- `closeZReport({ shopId, declaredCashUgx, notes, idempotencyKey })` → in a single transaction:
  1. Lock the most recent `shiftClosures` row for that shop (`select … for update`).
  2. Re-aggregate sales `> previous closedAt && <= now()`.
  3. Insert new row with `closureNumber = previous + 1`, `varianceUgx = declared - expected`.
  4. Return the inserted row.
  Idempotency: reuses the existing `idempotency-keys` table; client passes a UUID.
- `getZReportHistory({ shopId, limit })` → list past closures, newest first.
- `getZReportById({ id })` → single closure with full per-clerk breakdown reconstructed by re-querying sales between `periodStart` and `closedAt` (read-only; the persisted row holds totals, breakdowns are recomputed deterministically).

All three are gated by `requireRole(session, ["admin", "supervisor"])`. The `closeZ` and `getX` calls also need IP allowlist enforcement — use `requireRoleWithIpCheck` like other gated calls.

**New permission:** `shift.reports.view` → admin + supervisor. Added to `PERMISSION_SERVER_GATES`.

**New routes:**

- `/reports/x` — X report view for current shop. Date picker not needed (always "since last Z"). Shop selector for admins managing >1 shop.
- `/reports/z` — landing page: "Close current shift" CTA + last 10 closures list.
- `/reports/z/$id` — detail view + print button (uses the same receipt-html infra to render 80mm thermal).

**New components (`src/components/reports/`):**

- `ShopPicker` — small `<select>` for admins; supervisor sees only their shop.
- `XReportView` — KPI cards (gross, cash, bank, credit, variance preview), per-clerk table, per-payment-method table.
- `ZReportCloseDialog` — declared cash input + notes + "Close shift" button. Shows expected vs declared in real time as user types.
- `ZReportPrintable` — opens a new window with HTML rendered by `renderShiftClosureReceipt` (new function in `src/lib/pdf/shift-closure-html.ts`).
- `ZReportHistoryTable` — uses `ResponsiveTable` for mobile parity.

**Reusable additions:**

- `src/lib/pdf/shift-closure-html.ts` — modeled exactly on `receipt-html.ts`; 80mm thermal layout; includes closure number, period range, totals, per-method breakdown, variance, clerk name.

### Task 4 — Mobile camera + Desktop QR

**Mobile camera capture (zero new infra):**

Edit `src/components/products/image-uploader.tsx`:
- Add `capture="environment"` to the existing `<input type="file" accept="image/*">`. That's the whole change for mobile.
- The QR panel (described below) sits alongside the upload button. Both controls render on all viewports; mobile users will typically use the file-input camera, desktop users typically reach for the QR.

**Desktop QR flow:**

**New DB table (`src/db/schema/picture-upload-tokens.ts`):**

```ts
pictureUploadTokens
  id           uuid PK
  token        text not null unique  // 32 random bytes, base64url
  productColorId uuid not null → productColors (cascade)
  createdBy    text not null → user
  expiresAt    timestamptz not null  // now + 15 min
  consumedAt   timestamptz nullable
  uploadedKey  text nullable         // S3 key after upload
  createdAt    timestamptz default now
```

Index: `(token)`, `(productColorId, consumedAt)`.

**New server functions (`src/server/functions/products/photo-handoff.ts`):**

- `createPhotoUploadToken({ productColorId })` → admin/supervisor only; generates a 32-byte token; inserts row; returns `{ token, url, expiresAt }`. `url = ${env.SITE_URL}/upload-photo/${token}`.
- `getPhotoUploadStatus({ token })` → returns `{ status: "pending" | "consumed" | "expired", uploadedKey }`. Used by desktop polling. No auth required (token *is* the auth).
- `redeemPhotoUploadToken({ token, contentType })` → public; validates token (exists, not expired, not consumed); issues an S3 presigned PUT URL for `products/{productId}/{colorId}.jpg`; **does not** mark consumed (waits for `confirmPhotoUpload`).
- `confirmPhotoUpload({ token })` → public; marks `consumedAt = now`, `uploadedKey = key`. Atomically updates the corresponding `productColors.imageUrl`.

**New routes:**

- `/upload-photo/$token` — public route, no `requireUiPermission`. Validates token via `redeemPhotoUploadToken`, shows the same `ImageUploader` (with `capture` attribute), uploads to S3, calls `confirmPhotoUpload`, then shows success state with a "Take another for this product" button (only if token allows multi-upload — for now: single use, show only success).

**New components:**

- `src/components/products/photo-handoff-qr.tsx` — renders the QR + token expiry countdown + "Refresh QR" button. Polls `getPhotoUploadStatus` every 2s while open; on `consumed`, invokes `onUploaded` and closes.
  - **QR rendering:** uses the `qrcode` npm package's `toDataURL()` API to produce a PNG data URL, then renders via a plain `<img src={dataUrl} />`. No `dangerouslySetInnerHTML`; the URL we encode is constructed server-side from a known origin + opaque token, so injection surface is nil — but using an `<img>` keeps the safe path obvious.
- Integrated into `color-editor.tsx` alongside the existing `ImageUploader`.

**New dependency:** `qrcode` (npm). Tiny, no deps, generates PNG data URLs and SVG strings.

### Task 1 — Mobile verification

The mobile POS flow already has a Cypress smoke test (`cypress/e2e/08-mobile-pos.cy.ts`, currently `.skip` because of a TanStack Start lazy-hydration timing issue in Cypress headless Electron — manual browser verification still works). Mobile admin screens are covered by `09-mobile-admin-screens.cy.ts`.

No new test file for the existing flow. Instead:
- Extend `09-mobile-admin-screens.cy.ts` with checks for `/reports/x` and `/reports/z` (no horizontal overflow at `390x844`).
- The new feature's mobile usability (QR panel placement, X/Z layout) is verified by extending `09-...` rather than spawning a third mobile file.

---

## Data flow

### X report
```
operator opens /reports/x
  → loader: getXReport({shopId})
    → query: last shiftClosures row for shopId (may be null)
    → query: shopSales + items + soldByUser since previous closedAt (or all-time)
    → aggregate: gross, by-method, by-clerk
  → render KPI cards + tables
```

### Z report close
```
operator clicks "Close shift"
  → dialog opens, fetches getXReport for live expected total
  → operator types declared cash
  → submit → closeZReport({shopId, declaredCash, idempotencyKey})
    → BEGIN
      SELECT … FROM shift_closures WHERE shopId=? ORDER BY closureNumber DESC LIMIT 1 FOR UPDATE
      re-aggregate sales since previous.closedAt (or epoch)
      INSERT shift_closures (… closureNumber = prev+1)
    → COMMIT
  → router invalidate; open print window with shift-closure-html
```

### Desktop QR upload
```
desktop user clicks "Take with phone"
  → createPhotoUploadToken → {token, url, expiresAt}
  → render QR(url) + start poll(getPhotoUploadStatus, 2s)

phone user scans QR → opens /upload-photo/{token}
  → loader: validate token (not expired/consumed) → render uploader
  → user taps "Take photo" → file input opens camera
  → on file ready:
    → redeemPhotoUploadToken({token, contentType}) → presigned PUT
    → PUT file directly to S3
    → confirmPhotoUpload({token}) → updates productColors.imageUrl, marks consumed
  → show "Done — return to your computer"

desktop poll hits "consumed"
  → fetch new image URL → invalidate route → close QR panel
```

---

## Error handling

- **Z report variance:** never blocks the close — variance is recorded. Large variance (>10% of expected, or >50,000 UGX) shows a confirm-step "Are you sure?" toast but still allows close.
- **Z report idempotency:** if the operator double-clicks, the idempotency key short-circuits the second call and returns the first row's id. No duplicate Z numbers.
- **Token expiry:** desktop QR shows a countdown; on expiry, render a "Generate new QR" button. Mobile route shows "This link has expired — ask the operator for a new one."
- **Token already consumed:** mobile route shows "Already used. Ask the operator for a new one."
- **S3 upload failure:** mobile shows toast; token remains unconsumed; user can retry. After 3 failed attempts, suggest regenerating.
- **Network drop mid-Z-close:** operator sees error toast; if the transaction committed but the response was lost, idempotency lookup returns the existing row.

---

## Testing

**Unit / integration (vitest):**
- `__tests__/shift-reports.test.ts`
  - X report aggregates correctly with no prior Z.
  - X report aggregates correctly since last Z.
  - Z close increments closureNumber per shop.
  - Z close computes variance: declared > expected, declared < expected, declared == expected.
  - Z close idempotency: same idempotency key → same row id, no second insert.
- `__tests__/photo-handoff.test.ts`
  - Token redeem fails when expired.
  - Token redeem fails when already consumed.
  - Confirm updates productColors.imageUrl.
- `__tests__/shift-closure-html.test.ts`
  - Snapshot of rendered receipt HTML (80mm).
- Extend `__tests__/permissions.test.ts` — `shift.reports.view` gate is enforced server-side.

**E2E (cypress):**
- `cypress/e2e/10-shift-reports.cy.ts` — log in as supervisor, sell 3 items, open X, see the 3, close Z, open Z detail, assert numbers match.
- Extend `cypress/e2e/09-mobile-admin-screens.cy.ts` with `/reports/x` and `/reports/z` overflow checks.

---

## Build sequence

Order keeps each PR small and shippable:

1. **Schema + migrations** for both `shift_closures` and `picture_upload_tokens` in one migration (cheaper than two).
2. **X/Z server functions** + tests.
3. **X/Z routes and components** + permission gate + sidebar entries (visible for admin/supervisor).
4. **Shift closure HTML printer** + test + wire print button.
5. **Mobile capture attr** on `ImageUploader` (one-line change, ship immediately).
6. **Photo handoff server functions** + public route + QR component.
7. **Cypress mobile smoke** + shift-report E2E.
8. **Tasks.md** — check off all 5 items.

Each step gets its own atomic commit. Steps 1-4 ship task #5. Step 5 ships half of task #4. Step 6 ships the other half. Step 7 ships task #1's verification piece.

---

## What this design does NOT do (YAGNI)

- No formal "shift open" workflow. Z's `periodStart` is derived from the previous Z. Adding open-shift would mean another table, another route, another concept for operators to learn.
- No cron-based auto-Z at midnight. Operators close manually when leaving.
- No multi-shop Z (close multiple shops at once). One shop per Z.
- No reopening a closed Z. Mistakes get corrected by a new sale/return + next Z.
- No QR for receipts, customer signup, etc. — only product photos for now.
- No real-time push for QR upload completion (SSE/websocket). 2s polling is fine for a 15-min window.
- No image moderation / virus scan on uploads. Out of scope; S3 + signed URLs already restrict.
- No backwards-compatible shim for old `ImageUploader` consumers — the change is additive.
