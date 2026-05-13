# Mobile responsiveness & POS sales mode

**Date:** 2026-05-13
**Status:** Approved (brainstorm session, this session)
**Scope tier:** C — salesman-first redesign + comprehensive admin/supervisor mobile-optimize

## Goal

Turn the inventory app into a polished POS app for salesmen on phones, and make every other role's screen pleasant on mobile.

## In scope

1. New `/pos` route — full-screen mobile POS for `role=sales`.
2. Auto-redirect to `/pos` after login when `role=sales`.
3. Hybrid POS UI: sticky search, 2-column product grid, slide-up cart sheet, bottom cart-bar.
4. Stepped variant picker (color → size → qty → price + below-min reason inline).
5. 3-step checkout (payment → confirm → success). "Print receipt" placeholder on success screen (wired in next feature).
6. Avatar dropdown in POS header for: Sales history, Receive transfers, Log out.
7. Comprehensive mobile-optimize across all admin/supervisor screens — tables become card lists below 768px, dialogs become full-screen sheets, sticky bottom action bars on long forms.

## Out of scope (separate specs)

- **Multi-clerk per shop** — coming next. Sale records will still capture `userId` (already do), but no UI for clerk filtering yet.
- **Offline sales queueing** — coming after multi-clerk. Major architectural shift; needs its own design discussion of conflict resolution.
- **POS receipt printing** — separate spec; placeholder button only.
- **IP allowlist** — separate spec.
- **Customer info capture, split payments, discounts, push notifications** — deferred.

## Architecture

### Routing & layout

- New route `src/routes/pos.tsx` — single full-screen page.
- Gated by `requireUiPermission(context, "sales.create")`. Admin and supervisor can also access for testing/training.
- Auto-redirect logic in `src/routes/__root.tsx`: if `session.user.role === "sales"` and pathname is not `/pos`, `/login`, `/logout`, `/accept-invite`, redirect to `/pos`. Strictly equal — no fall-through.
- New `PosLayout` component — no sidebar, no app-header. Provides: top header with search + avatar dropdown, content area, sticky bottom cart-bar.

### POS screen structure

- **Top header:** sticky. Search input + avatar (dropdown menu).
- **Product grid:** 2-col phone (≥ 640px tweaks to 2-col larger cells), 3-col tablet, 4-col landscape. Drives off `aggregateStockByArticle` data (existing helper) — one card per article (not per variant). Card shows: image, article, name, color swatches, total quantity.
- **Card tap:** opens variant picker sheet (stepped).
- **Sticky bottom cart-bar:** count badge + total. Tap to expand cart sheet. Hidden when cart empty.
- **Cart sheet:** shadcn `Sheet` component (already in `src/components/ui/sheet.tsx`) with `side="bottom"`. Item list with image, name, variant, qty stepper, line price. Total at bottom. "Checkout" button.

### Variant picker (stepped sheet)

Three steps in one slide-up sheet. Footer has Back + Next/Add buttons.

1. **Color** — tile grid of available colors. Disabled tiles for out-of-stock colors.
2. **Size** — pill row. Disabled pills for out-of-stock sizes for the chosen color.
3. **Qty + price** — qty stepper (clamped to available), price input (defaults to `minimumSellPriceUgx`), inline below-min reason input when price drops below min.

Final button: "Add to cart · UGX {line_total}".

### Checkout flow (stepped)

Sheet expands from cart. Three steps.

1. **Payment** — Cash / Bank cards. Tap to select.
2. **Confirm** — Itemized list, payment method, total. "Confirm sale" button.
3. **Success** — Sale ID, item count, payment, total. "+ New sale" (resets cart + closes sheet) and "Print receipt" (placeholder no-op until next feature).

### Comprehensive mobile-optimize

For every existing screen used by admin/supervisor:

- **`Dialog` → `ResponsiveDialog`** — renders as `Dialog` on `md+`, `Sheet` with `side="bottom"` (full-height) on mobile. Update sites: shop index (new-sale, receive-transfer), supply route detail, store opening balance, shop opening balance, product editor, color editor.
- **Tables → `ResponsiveTable`** — renders as `Table` on `md+`, vertical card list on mobile. Update sites: supply route items, store stock list, shop sales list, customer list, returns list, reports tables.
- **Forms** — full-width inputs on mobile, sticky bottom action bar containing primary CTA, `h-11` and `text-base` for inputs. Update sites: all create/edit forms.
- **Sidebar** — already responsive (drawer on mobile via `app-sidebar.tsx`). For `role=sales`, prune sidebar to only "POS", "Sales history", "Receive transfers" (only when not on `/pos`).

### Cart state

Local — `useReducer` in a `CartProvider` context scoped to `/pos`. Persisted to `localStorage` keyed by `shopId` so a refresh doesn't lose the cart. Cleared on successful sale.

Shape:
```ts
type CartItem = {
  shopStockId: string
  productLabel: string
  imageUrl: string | null
  colorHex: string
  qty: number
  unitPriceUgx: string
  minimumSellPriceUgx: string
  belowMinimumReason: string
  availableQty: number
}
```

### Server functions

No new server functions. Reuses:
- `getShopStock({ shopId })` — already exists.
- `recordSale({ shopId, paymentMethod, items })` — already exists, no shape change.

## New files

```
src/routes/pos.tsx
src/components/pos/pos-layout.tsx
src/components/pos/pos-header.tsx
src/components/pos/avatar-menu.tsx
src/components/pos/product-grid.tsx
src/components/pos/cart-bar.tsx
src/components/pos/cart-sheet.tsx
src/components/pos/variant-picker-sheet.tsx
src/components/pos/checkout-sheet.tsx
src/components/pos/cart-context.tsx
src/components/ui/responsive-dialog.tsx
src/components/ui/responsive-table.tsx
src/lib/hooks/use-is-mobile.ts
src/lib/pos/cart-reducer.ts                 # pure reducer for vitest tests
src/lib/pos/checkout-validate.ts            # pure validation for vitest tests
src/__tests__/cart-reducer.test.ts
src/__tests__/checkout-validate.test.ts
src/__tests__/use-is-mobile.test.ts
cypress/e2e/08-mobile-pos.cy.ts
cypress/e2e/09-mobile-admin-screens.cy.ts
```

## Modified files

```
src/routes/__root.tsx                       # role-based auto-redirect
src/components/app-sidebar.tsx              # pruned items for role=sales
src/routes/shop/index.tsx                   # dialog → responsive-dialog
src/routes/shop/sales.tsx                   # table → responsive-table
src/routes/supply/*.tsx                     # dialogs + tables responsive
src/routes/store/*.tsx                      # dialogs + tables responsive
src/routes/products/*.tsx                   # already card-based, minor polish
src/routes/customers/*.tsx                  # tables responsive
src/routes/reports/*.tsx                    # tables responsive
src/components/opening-balance/opening-balance-form.tsx  # mobile layout
src/components/transfers/receive-transfer-form.tsx       # mobile layout
src/components/products/product-editor.tsx               # mobile layout
src/components/products/color-editor.tsx                 # mobile layout
src/lib/permissions.ts                      # add pos.view (sales/admin/supervisor)
src/lib/help-dictionary.ts                  # add tips for cart, variant picker, checkout
```

## Permissions

Add `pos.view` granted to `admin`, `supervisor`, `sales`. Used to gate `/pos`.

Existing `sales.create` and `sales.view` are reused. No data-model permissions change.

## Testing strategy — strict TDD

For every behavior, write failing test → minimum code to pass → refactor.

### Vitest (logic, runs in `node` env)

- `cart-reducer.test.ts` — add item, remove item, update qty, update price, below-min flag, total calc with BigNumber, dedupe by `shopStockId`.
- `checkout-validate.test.ts` — required fields per step, qty within stock, below-min requires reason, price > 0.
- `use-is-mobile.test.ts` — matches `(max-width: 767px)` media query mock, returns correct boolean.
- Existing tests stay green (no schema change).

### Cypress (E2E, real browser, real DB)

- **`08-mobile-pos.cy.ts`** — viewport set to 390×844 (iPhone 14). Covers:
  - sign up sales role + assign shopId via task
  - login → auto-redirect to `/pos`
  - search filters grid
  - tap product → variant sheet → color → size → qty → price → add
  - open cart, change qty, remove item
  - checkout: cash → confirm → success
  - sale appears in `/shop/sales` (login as admin to verify)
- **`09-mobile-admin-screens.cy.ts`** — viewport 390×844, login as admin. Walks through:
  - supply route detail → table renders as cards, dialog opens as full-screen sheet
  - store opening balance form usable without overflow
  - shop sales table renders as cards
  - sidebar drawer opens and closes

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Auto-redirect traps a misconfigured admin who happens to have `role="sales"` | Strict equality check; admin/supervisor cannot have `sales` as primary role per existing permission registry. |
| Cart `localStorage` leaks across users on shared device | Key on `userId + shopId`; clear on logout. |
| Two clerks at same shop oversell same variant | Out of scope (multi-clerk + offline next). For now, last write wins via server-side stock check. |
| Stepped variant picker feels slow for repeat sales | Add "Recent variants" pinned at top of color step (deferred — flag in plan). |
| Existing Cypress flakiness on mobile viewport | Use `cy.viewport()` in `beforeEach`; explicit waits on intercepts. |
| Sheet animation jank on lower-end Android | Test on actual device after merge; tune `Sheet` `side="bottom"` transition. |

## Open decisions captured (from brainstorm)

| Decision | Choice |
|---|---|
| Scope tier | C (salesman-first + comprehensive) |
| Sales-mode style | Hybrid (search + grid + cart sheet) |
| Placement | Full takeover via `/pos`, auto-redirect on login |
| Secondary screens | Avatar dropdown |
| Variant picker | Stepped (color → size → qty → price) |
| Checkout | 3-step (payment → confirm → success) |
| Admin/supervisor mobile | Comprehensive (every screen mobile-perfect) |
| Multi-clerk / offline | Out of scope — next specs |
