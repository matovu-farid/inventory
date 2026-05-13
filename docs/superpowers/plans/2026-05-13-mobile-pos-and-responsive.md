# Mobile POS & Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated mobile POS app for `role=sales` at `/pos` with hybrid search+grid, stepped variant picker and 3-step checkout, and mobile-optimize every admin/supervisor screen.

**Architecture:** New `PosLayout` and `/pos` route; auto-redirect on login for sales role; cart state in a Context with `localStorage` persistence; shadcn `Sheet` (`side="bottom"`) for all mobile drawers; new `ResponsiveDialog` and `ResponsiveTable` UI primitives that adapt at the `md` (768px) breakpoint.

**Tech Stack:** TanStack Start + React 19, shadcn (Radix), Tailwind 4, BigNumber.js, Vitest (jsdom for React hooks/components, node for pure logic), Cypress 15. Strict TDD throughout.

**Spec:** `docs/superpowers/specs/2026-05-13-mobile-pos-and-responsive-design.md`

---

## Phase 1 — Foundation primitives

### Task 1: `useIsMobile` hook

**Files:**
- Create: `src/lib/hooks/use-is-mobile.ts`
- Create: `src/__tests__/use-is-mobile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/use-is-mobile.test.tsx
// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches,
    media: q,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
  return {
    setMatches(next: boolean) {
      listeners.forEach((l) => l({ matches: next }))
    },
  }
}

describe("useIsMobile", () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it("returns false when viewport is wider than 768px", () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it("returns true when viewport matches mobile", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it("updates when the media query changes", () => {
    const m = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => m.setMatches(true))
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/use-is-mobile.test.tsx`
Expected: FAIL (`Cannot find module '#/lib/hooks/use-is-mobile'`).

- [ ] **Step 3: Implement the hook**

```ts
// src/lib/hooks/use-is-mobile.ts
import { useEffect, useState } from "react"

const QUERY = "(max-width: 767px)"

export function useIsMobile(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(QUERY)
    const handler = (e: { matches: boolean }) => setMatches(e.matches)
    mq.addEventListener("change", handler)
    setMatches(mq.matches)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return matches
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/use-is-mobile.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/use-is-mobile.ts src/__tests__/use-is-mobile.test.tsx
git commit -m "feat(ui): useIsMobile hook with matchMedia listener"
```

---

### Task 2: Cart reducer (pure logic)

**Files:**
- Create: `src/lib/pos/cart-reducer.ts`
- Create: `src/__tests__/cart-reducer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/cart-reducer.test.ts
import { describe, it, expect } from "vitest"
import BigNumber from "bignumber.js"
import { cartReducer, computeTotal, initialCart, type CartItem } from "#/lib/pos/cart-reducer"

const item: CartItem = {
  shopStockId: "stk1",
  productLabel: "TR-001 · Crew Tee",
  imageUrl: null,
  colorHex: "#dc2626",
  qty: 1,
  unitPriceUgx: "50000",
  minimumSellPriceUgx: "50000",
  belowMinimumReason: "",
  availableQty: 10,
}

describe("cartReducer", () => {
  it("starts empty", () => {
    expect(initialCart.items).toEqual([])
  })

  it("adds an item", () => {
    const s = cartReducer(initialCart, { type: "add", item })
    expect(s.items).toHaveLength(1)
    expect(s.items[0].shopStockId).toBe("stk1")
  })

  it("deduplicates by shopStockId (merges qty)", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "add", item: { ...item, qty: 2 } })
    expect(s2.items).toHaveLength(1)
    expect(s2.items[0].qty).toBe(3)
  })

  it("clamps qty to availableQty when merging", () => {
    const s1 = cartReducer(initialCart, { type: "add", item: { ...item, qty: 8 } })
    const s2 = cartReducer(s1, { type: "add", item: { ...item, qty: 5 } })
    expect(s2.items[0].qty).toBe(10)
  })

  it("removes an item", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "remove", shopStockId: "stk1" })
    expect(s2.items).toHaveLength(0)
  })

  it("updates qty (clamped 1..availableQty)", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "updateQty", shopStockId: "stk1", qty: 99 })
    expect(s2.items[0].qty).toBe(10)
    const s3 = cartReducer(s2, { type: "updateQty", shopStockId: "stk1", qty: 0 })
    expect(s3.items[0].qty).toBe(1)
  })

  it("updates price and reason", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "updatePrice", shopStockId: "stk1", unitPriceUgx: "40000" })
    expect(s2.items[0].unitPriceUgx).toBe("40000")
    const s3 = cartReducer(s2, { type: "updateReason", shopStockId: "stk1", reason: "haggled" })
    expect(s3.items[0].belowMinimumReason).toBe("haggled")
  })

  it("clears the cart", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    expect(cartReducer(s1, { type: "clear" }).items).toEqual([])
  })

  it("computes total with BigNumber", () => {
    const s = cartReducer(initialCart, { type: "add", item: { ...item, qty: 2, unitPriceUgx: "40000" } })
    expect(computeTotal(s.items).toFixed(0)).toBe("80000")
  })

  it("computeTotal returns zero for empty cart", () => {
    expect(computeTotal([]).eq(new BigNumber(0))).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/cart-reducer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the reducer**

```ts
// src/lib/pos/cart-reducer.ts
import BigNumber from "bignumber.js"

export type CartItem = {
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

export type CartState = { items: CartItem[] }

export type CartAction =
  | { type: "add"; item: CartItem }
  | { type: "remove"; shopStockId: string }
  | { type: "updateQty"; shopStockId: string; qty: number }
  | { type: "updatePrice"; shopStockId: string; unitPriceUgx: string }
  | { type: "updateReason"; shopStockId: string; reason: string }
  | { type: "clear" }
  | { type: "hydrate"; state: CartState }

export const initialCart: CartState = { items: [] }

function clampQty(qty: number, available: number): number {
  if (!Number.isFinite(qty) || qty < 1) return 1
  return Math.min(qty, Math.max(1, available))
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const existing = state.items.find((i) => i.shopStockId === action.item.shopStockId)
      if (existing) {
        const mergedQty = clampQty(existing.qty + action.item.qty, existing.availableQty)
        return {
          items: state.items.map((i) =>
            i.shopStockId === action.item.shopStockId ? { ...i, qty: mergedQty } : i,
          ),
        }
      }
      return { items: [...state.items, { ...action.item, qty: clampQty(action.item.qty, action.item.availableQty) }] }
    }
    case "remove":
      return { items: state.items.filter((i) => i.shopStockId !== action.shopStockId) }
    case "updateQty":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, qty: clampQty(action.qty, i.availableQty) } : i,
        ),
      }
    case "updatePrice":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, unitPriceUgx: action.unitPriceUgx } : i,
        ),
      }
    case "updateReason":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, belowMinimumReason: action.reason } : i,
        ),
      }
    case "clear":
      return initialCart
    case "hydrate":
      return action.state
  }
}

export function computeTotal(items: CartItem[]): BigNumber {
  return items.reduce(
    (sum, i) => sum.plus(new BigNumber(i.unitPriceUgx || 0).times(i.qty)),
    new BigNumber(0),
  )
}

export function isBelowMin(item: CartItem): boolean {
  return new BigNumber(item.unitPriceUgx || 0).lt(item.minimumSellPriceUgx)
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/cart-reducer.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pos/cart-reducer.ts src/__tests__/cart-reducer.test.ts
git commit -m "feat(pos): pure cart reducer with dedupe and qty clamping"
```

---

### Task 3: Checkout validation (pure logic)

**Files:**
- Create: `src/lib/pos/checkout-validate.ts`
- Create: `src/__tests__/checkout-validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/checkout-validate.test.ts
import { describe, it, expect } from "vitest"
import { validateCartForCheckout, type ValidationIssue } from "#/lib/pos/checkout-validate"
import type { CartItem } from "#/lib/pos/cart-reducer"

const base: CartItem = {
  shopStockId: "stk1",
  productLabel: "TR-001 Tee",
  imageUrl: null,
  colorHex: "#000",
  qty: 1,
  unitPriceUgx: "50000",
  minimumSellPriceUgx: "50000",
  belowMinimumReason: "",
  availableQty: 5,
}

describe("validateCartForCheckout", () => {
  it("rejects empty cart", () => {
    const r = validateCartForCheckout([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0].code).toBe("empty")
  })

  it("rejects zero or negative price", () => {
    const r = validateCartForCheckout([{ ...base, unitPriceUgx: "0" }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const i = r.issues.find((x: ValidationIssue) => x.code === "price")
      expect(i?.shopStockId).toBe("stk1")
    }
  })

  it("rejects qty exceeding available", () => {
    const r = validateCartForCheckout([{ ...base, qty: 99 }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((x) => x.code === "qty")).toBe(true)
    }
  })

  it("requires reason when price below minimum", () => {
    const r = validateCartForCheckout([{ ...base, unitPriceUgx: "30000", belowMinimumReason: "" }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((x) => x.code === "reason")).toBe(true)
    }
  })

  it("accepts below-min with non-empty reason", () => {
    const r = validateCartForCheckout([{ ...base, unitPriceUgx: "30000", belowMinimumReason: "haggled" }])
    expect(r.ok).toBe(true)
  })

  it("passes for valid cart", () => {
    const r = validateCartForCheckout([base])
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/checkout-validate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement validation**

```ts
// src/lib/pos/checkout-validate.ts
import BigNumber from "bignumber.js"
import type { CartItem } from "./cart-reducer"

export type ValidationIssue =
  | { code: "empty" }
  | { code: "price"; shopStockId: string }
  | { code: "qty"; shopStockId: string; available: number }
  | { code: "reason"; shopStockId: string }

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] }

export function validateCartForCheckout(items: CartItem[]): ValidationResult {
  if (items.length === 0) return { ok: false, issues: [{ code: "empty" }] }
  const issues: ValidationIssue[] = []
  for (const i of items) {
    const price = new BigNumber(i.unitPriceUgx || 0)
    if (!price.isFinite() || price.lte(0)) {
      issues.push({ code: "price", shopStockId: i.shopStockId })
    }
    if (i.qty < 1 || i.qty > i.availableQty) {
      issues.push({ code: "qty", shopStockId: i.shopStockId, available: i.availableQty })
    }
    if (
      price.isFinite() &&
      price.gt(0) &&
      price.lt(i.minimumSellPriceUgx) &&
      i.belowMinimumReason.trim().length === 0
    ) {
      issues.push({ code: "reason", shopStockId: i.shopStockId })
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/checkout-validate.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pos/checkout-validate.ts src/__tests__/checkout-validate.test.ts
git commit -m "feat(pos): checkout validation rules"
```

---

### Task 4: `ResponsiveDialog` component

**Files:**
- Create: `src/components/ui/responsive-dialog.tsx`
- Create: `src/__tests__/responsive-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/responsive-dialog.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from "#/components/ui/responsive-dialog"

afterEach(cleanup)

function setMatches(matches: boolean) {
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
}

describe("ResponsiveDialog", () => {
  beforeEach(() => setMatches(false))

  it("renders dialog content on desktop", () => {
    setMatches(false)
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Hello</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <p>Body content</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    expect(screen.getByText("Hello")).toBeTruthy()
    expect(screen.getByText("Body content")).toBeTruthy()
  })

  it("renders sheet content on mobile", () => {
    setMatches(true)
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Hello mobile</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <p>Body content</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    expect(screen.getByText("Hello mobile")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/responsive-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/ui/responsive-dialog.tsx
import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"
import { cn } from "#/lib/utils"

type RootProps = React.ComponentProps<typeof Dialog>

export function ResponsiveDialog(props: RootProps) {
  const isMobile = useIsMobile()
  return isMobile ? <Sheet {...props} /> : <Dialog {...props} />
}

type ContentProps = React.ComponentProps<typeof DialogContent> & {
  side?: "bottom" | "right" | "left" | "top"
}

export function ResponsiveDialogContent({ className, side = "bottom", children, ...props }: ContentProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <SheetContent
        side={side}
        className={cn("max-h-[92dvh] overflow-y-auto", className)}
        {...(props as React.ComponentProps<typeof SheetContent>)}
      >
        {children}
      </SheetContent>
    )
  }
  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  )
}

export function ResponsiveDialogHeader(props: React.ComponentProps<typeof DialogHeader>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetHeader {...(props as React.ComponentProps<typeof SheetHeader>)} /> : <DialogHeader {...props} />
}

export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetTitle {...(props as React.ComponentProps<typeof SheetTitle>)} /> : <DialogTitle {...props} />
}

export function ResponsiveDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile()
  return isMobile
    ? <SheetDescription {...(props as React.ComponentProps<typeof SheetDescription>)} />
    : <DialogDescription {...props} />
}

export function ResponsiveDialogFooter(props: React.ComponentProps<typeof DialogFooter>) {
  const isMobile = useIsMobile()
  return isMobile ? <SheetFooter {...(props as React.ComponentProps<typeof SheetFooter>)} /> : <DialogFooter {...props} />
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/responsive-dialog.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/responsive-dialog.tsx src/__tests__/responsive-dialog.test.tsx
git commit -m "feat(ui): ResponsiveDialog adapts to Sheet on mobile"
```

---

### Task 5: `ResponsiveTable` component

**Files:**
- Create: `src/components/ui/responsive-table.tsx`
- Create: `src/__tests__/responsive-table.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/responsive-table.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ResponsiveTable } from "#/components/ui/responsive-table"

afterEach(cleanup)

function setMatches(matches: boolean) {
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    media: "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
}

type Row = { id: string; name: string; qty: number }
const rows: Row[] = [
  { id: "a", name: "Tee", qty: 3 },
  { id: "b", name: "Bomber", qty: 1 },
]

describe("ResponsiveTable", () => {
  beforeEach(() => setMatches(false))

  it("renders as table on desktop", () => {
    setMatches(false)
    render(
      <ResponsiveTable<Row>
        data={rows}
        getRowKey={(r) => r.id}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Qty", cell: (r) => r.qty },
        ]}
      />,
    )
    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByText("Tee")).toBeTruthy()
  })

  it("renders as card list on mobile", () => {
    setMatches(true)
    const { container } = render(
      <ResponsiveTable<Row>
        data={rows}
        getRowKey={(r) => r.id}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Qty", cell: (r) => r.qty },
        ]}
      />,
    )
    expect(container.querySelector("table")).toBeNull()
    expect(screen.getByText("Tee")).toBeTruthy()
    expect(screen.getByText("Bomber")).toBeTruthy()
  })

  it("shows empty state when data is empty", () => {
    setMatches(false)
    render(
      <ResponsiveTable<Row>
        data={[]}
        getRowKey={(r) => r.id}
        columns={[{ header: "Name", cell: (r) => r.name }]}
        emptyMessage="No data yet"
      />,
    )
    expect(screen.getByText("No data yet")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/responsive-table.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/ui/responsive-table.tsx
import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"
import { cn } from "#/lib/utils"

export type ResponsiveColumn<T> = {
  header: string
  cell: (row: T) => React.ReactNode
  /** Show as label in mobile card; defaults to header */
  mobileLabel?: string
  className?: string
  align?: "left" | "right"
  /** Hide this column entirely in mobile card view */
  hideOnMobile?: boolean
}

type Props<T> = {
  data: T[]
  columns: ResponsiveColumn<T>[]
  getRowKey: (row: T) => string
  emptyMessage?: string
  className?: string
  /** Optional row click handler (mobile renders rows as buttons when set) */
  onRowClick?: (row: T) => void
}

export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  emptyMessage = "No data.",
  className,
  onRowClick,
}: Props<T>) {
  const isMobile = useIsMobile()

  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-2", className)}>
        {data.map((row) => {
          const inner = (
            <div className="space-y-1.5">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.header} className="flex items-start justify-between gap-3 text-sm">
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {c.mobileLabel ?? c.header}
                    </span>
                    <span className={cn("min-w-0 text-right", c.align === "left" && "text-left")}>{c.cell(row)}</span>
                  </div>
                ))}
            </div>
          )
          return onRowClick ? (
            <button
              key={getRowKey(row)}
              type="button"
              onClick={() => onRowClick(row)}
              className="block w-full rounded-lg border bg-card p-3 text-left"
            >
              {inner}
            </button>
          ) : (
            <div key={getRowKey(row)} className="rounded-lg border bg-card p-3">
              {inner}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={cn(c.align === "right" && "text-right", c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((c) => (
                <TableCell key={c.header} className={cn(c.align === "right" && "text-right", c.className)}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/responsive-table.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/responsive-table.tsx src/__tests__/responsive-table.test.tsx
git commit -m "feat(ui): ResponsiveTable renders cards on mobile"
```

---

## Phase 2 — Permissions, routing, sidebar

### Task 6: Add `pos.view` permission

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/__tests__/permissions.test.ts` (if it asserts the set; check the file first)

- [ ] **Step 1: Read current permissions file and find `Permission` union**

Run: `pnpm tsc --noEmit -p .` first to confirm green baseline.

- [ ] **Step 2: Edit the permissions file**

Append `"pos.view"` to the `Permission` union and grant it to admin, supervisor, and sales. No new server gate yet (the `/pos` route gates on this UI permission; server-side gates remain on `recordSale` etc.).

Edits in `src/lib/permissions.ts`:

```ts
// add to the union literal type
export type Permission =
  | "procurement.view"
  | "warehouse.stock"
  | "warehouse.receiving"
  | "warehouse.transfers"
  | "warehouse.openingBalance"
  | "shop.view"
  | "shop.openingBalance"
  | "sales.view"
  | "customers.view"
  | "reports.view"
  | "users.manage"
  | "products.view"
  | "products.manage"
  | "pos.view"
```

```ts
// add to each role list (admin, supervisor, sales)
admin: [..., "products.manage", "pos.view"],
supervisor: [..., "products.manage", "pos.view"],
sales: ["shop.view", "sales.view", "products.view", "pos.view"],
```

```ts
// add to PERMISSION_SERVER_GATES — empty array (no server gate; UI only)
"pos.view": [],
```

- [ ] **Step 3: Update permissions test if it iterates the union**

Check `src/__tests__/permissions.test.ts`. If it has a hardcoded list of expected permissions, add `pos.view`. Otherwise no change.

- [ ] **Step 4: Verify**

Run: `pnpm test src/__tests__/permissions.test.ts && pnpm tsc --noEmit -p .`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/__tests__/permissions.test.ts
git commit -m "feat(perms): add pos.view (admin/supervisor/sales)"
```

---

### Task 7: Sales-role auto-redirect in `__root.tsx`

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Read the current file** (~150 lines)

- [ ] **Step 2: Add auto-redirect inside `RootLayout`**

Add this block right after the existing `useEffect` for `needsRedirect` (around line 89):

```tsx
const userRoleRaw = (session?.user as { role?: string } | undefined)?.role ?? ""
const isPosRoute = matches.some((m) => m.fullPath === "/pos")
const isOnPosPath = matches.some((m) => m.pathname?.startsWith("/pos") ?? false)
const needsPosRedirect =
  !!session &&
  userRoleRaw === "sales" &&
  !isPublicPage &&
  !isOnPosPath

useEffect(() => {
  if (needsPosRedirect) router.navigate({ to: "/pos" })
}, [needsPosRedirect, router])

if (needsPosRedirect) return null
```

Move the existing `userRole` declaration to use `userRoleRaw` (or rename `userRole` to use the value above; they're the same).

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(routing): auto-redirect role=sales to /pos"
```

---

### Task 8: Sidebar pruning for sales role

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Read the sidebar file and find where nav items are defined**

The sidebar likely has a `NAV_ITEMS` or similar array. Look for `useCan` calls or hard-coded item lists.

- [ ] **Step 2: Apply role-aware filtering**

When `userRole === "sales"`, the sidebar should show only:
- POS (`/pos`) — using a `Smartphone` or `ShoppingCart` icon from lucide-react
- Sales history (`/shop/sales`)
- Receive transfers (`/shop`)
- Settings → Logout

Use existing `useCan` for fine-grained gating. Add the `/pos` link gated on `useCan("pos.view")`. Filter the rest based on role string — sales sees only the three listed plus settings.

Concrete approach: where the sidebar reads `userRole`, add a `if (userRole === "sales")` branch that overrides the item list with the three POS-related items. Keep the existing else-branch for admin/supervisor unchanged.

Example shape (adapt to actual file structure):

```tsx
const salesItems = [
  { to: "/pos" as const, label: "Sell", icon: ShoppingCart, permission: "pos.view" as const },
  { to: "/shop/sales" as const, label: "My sales", icon: Receipt, permission: "sales.view" as const },
  { to: "/shop" as const, label: "Receive transfers", icon: PackageCheck, permission: "shop.view" as const },
]

const navItems = userRole === "sales" ? salesItems : standardItems
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p . && pnpm test src/__tests__/permissions.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat(sidebar): prune nav to POS/sales/transfers for role=sales"
```

---

## Phase 3 — POS components

### Task 9: `CartContext` with localStorage persistence

**Files:**
- Create: `src/components/pos/cart-context.tsx`
- Create: `src/__tests__/cart-context.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/cart-context.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { CartProvider, useCart } from "#/components/pos/cart-context"
import type { CartItem } from "#/lib/pos/cart-reducer"

afterEach(cleanup)
beforeEach(() => window.localStorage.clear())

const item: CartItem = {
  shopStockId: "stk1",
  productLabel: "TR-001 Tee",
  imageUrl: null,
  colorHex: "#000",
  qty: 1,
  unitPriceUgx: "50000",
  minimumSellPriceUgx: "50000",
  belowMinimumReason: "",
  availableQty: 5,
}

function Harness() {
  const { state, add, remove, clear } = useCart()
  return (
    <div>
      <p data-testid="count">{state.items.length}</p>
      <button onClick={() => add(item)}>add</button>
      <button onClick={() => remove("stk1")}>remove</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

describe("CartProvider", () => {
  it("provides cart state and actions", () => {
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByTestId("count").textContent).toBe("0")
    fireEvent.click(screen.getByText("add"))
    expect(screen.getByTestId("count").textContent).toBe("1")
    fireEvent.click(screen.getByText("remove"))
    expect(screen.getByTestId("count").textContent).toBe("0")
  })

  it("persists to localStorage", () => {
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    fireEvent.click(screen.getByText("add"))
    const raw = window.localStorage.getItem("test-cart")
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).items).toHaveLength(1)
  })

  it("hydrates from localStorage on mount", () => {
    window.localStorage.setItem(
      "test-cart",
      JSON.stringify({ items: [item] }),
    )
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByTestId("count").textContent).toBe("1")
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test src/__tests__/cart-context.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement provider**

```tsx
// src/components/pos/cart-context.tsx
import * as React from "react"
import {
  cartReducer,
  initialCart,
  type CartState,
  type CartItem,
} from "#/lib/pos/cart-reducer"

type CartCtx = {
  state: CartState
  add: (item: CartItem) => void
  remove: (shopStockId: string) => void
  updateQty: (shopStockId: string, qty: number) => void
  updatePrice: (shopStockId: string, unitPriceUgx: string) => void
  updateReason: (shopStockId: string, reason: string) => void
  clear: () => void
}

const Ctx = React.createContext<CartCtx | null>(null)

export function CartProvider({
  storageKey,
  children,
}: {
  storageKey: string
  children: React.ReactNode
}) {
  const [state, dispatch] = React.useReducer(cartReducer, initialCart)
  const hydrated = React.useRef(false)

  // Hydrate from localStorage once on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CartState
        if (parsed && Array.isArray(parsed.items)) {
          dispatch({ type: "hydrate", state: parsed })
        }
      } catch {
        // ignore corrupt storage
      }
    }
    hydrated.current = true
  }, [storageKey])

  // Persist on change
  React.useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [storageKey, state])

  const value = React.useMemo<CartCtx>(
    () => ({
      state,
      add: (item) => dispatch({ type: "add", item }),
      remove: (shopStockId) => dispatch({ type: "remove", shopStockId }),
      updateQty: (shopStockId, qty) => dispatch({ type: "updateQty", shopStockId, qty }),
      updatePrice: (shopStockId, unitPriceUgx) =>
        dispatch({ type: "updatePrice", shopStockId, unitPriceUgx }),
      updateReason: (shopStockId, reason) => dispatch({ type: "updateReason", shopStockId, reason }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [state],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartCtx {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useCart must be used inside CartProvider")
  return v
}
```

- [ ] **Step 4: Run and verify pass**

Run: `pnpm test src/__tests__/cart-context.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/cart-context.tsx src/__tests__/cart-context.test.tsx
git commit -m "feat(pos): CartProvider with localStorage hydration"
```

---

### Task 10: `PosHeader` + `AvatarMenu`

**Files:**
- Create: `src/components/pos/pos-header.tsx`
- Create: `src/components/pos/avatar-menu.tsx`

- [ ] **Step 1: Implement `AvatarMenu`**

```tsx
// src/components/pos/avatar-menu.tsx
import { Link, useRouter } from "@tanstack/react-router"
import { Receipt, PackageCheck, LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "#/components/ui/avatar"
import { authClient } from "#/lib/auth-client"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AvatarMenu({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter()
  async function handleLogout() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/shop/sales">
            <Receipt className="mr-2 size-4" /> Sales history
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/shop">
            <PackageCheck className="mr-2 size-4" /> Receive transfers
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/account">
            <User className="mr-2 size-4" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Implement `PosHeader`**

```tsx
// src/components/pos/pos-header.tsx
import * as React from "react"
import { Search } from "lucide-react"
import { Input } from "#/components/ui/input"
import { AvatarMenu } from "#/components/pos/avatar-menu"

type Props = {
  query: string
  onQueryChange: (q: string) => void
  userName: string
  userEmail: string
}

export function PosHeader({ query, onQueryChange, userName, userEmail }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background px-3 py-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <Input
          aria-label="Search products"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search products..."
          className="h-11 pl-9 text-base"
        />
      </div>
      <AvatarMenu userName={userName} userEmail={userEmail} />
    </header>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/pos/pos-header.tsx src/components/pos/avatar-menu.tsx
git commit -m "feat(pos): PosHeader with sticky search + AvatarMenu dropdown"
```

---

### Task 11: `ProductGrid` for POS

**Files:**
- Create: `src/components/pos/product-grid.tsx`

- [ ] **Step 1: Read existing `aggregateStockByArticle`**

`src/lib/products.ts` — note the `AggregatedProduct` shape it returns.

- [ ] **Step 2: Implement the grid**

```tsx
// src/components/pos/product-grid.tsx
import * as React from "react"
import { ShoppingBag } from "lucide-react"
import { productImageUrl } from "#/lib/products"
import type { AggregatedProduct } from "#/lib/products"

type Props = {
  products: AggregatedProduct[]
  query: string
  onPick: (p: AggregatedProduct) => void
}

export function ProductGrid({ products, query, onPick }: Props) {
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => {
      const a = p.product.articleNumber.toLowerCase()
      const n = p.product.name.toLowerCase()
      return a.includes(q) || n.includes(q)
    })
  }, [products, query])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <ShoppingBag className="size-8" strokeWidth={1.5} />
        <p className="text-sm">{query ? "No products match." : "No stock in this shop."}</p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {filtered.map((p) => {
        const firstColor = p.colors[0]
        const imgKey = firstColor?.imageS3Key ?? null
        const imgUrl = imgKey ? productImageUrl(imgKey) : null
        return (
          <li key={p.product.articleNumber}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="group block w-full overflow-hidden rounded-xl border bg-card text-left transition active:scale-[0.98]"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={p.product.name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="size-full"
                    style={{
                      background: `linear-gradient(135deg, ${firstColor?.colorHex ?? "#e5e7eb"}, #f5f5f5)`,
                    }}
                  />
                )}
                <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold">
                  {p.total}
                </div>
              </div>
              <div className="space-y-1 px-3 py-2">
                <p className="truncate text-sm font-semibold">{p.product.name}</p>
                <p className="text-xs text-muted-foreground">{p.product.articleNumber}</p>
                <div className="flex gap-1">
                  {p.colors.slice(0, 6).map((c) => (
                    <span
                      key={c.productColorId}
                      className="size-3 rounded-full border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/components/pos/product-grid.tsx
git commit -m "feat(pos): ProductGrid with search filter and stock badge"
```

---

### Task 12: `CartBar` sticky bottom bar

**Files:**
- Create: `src/components/pos/cart-bar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/pos/cart-bar.tsx
import { ShoppingCart } from "lucide-react"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { formatUgxTotal } from "#/lib/format"

type Props = {
  onOpenCart: () => void
}

export function CartBar({ onOpenCart }: Props) {
  const { state } = useCart()
  const count = state.items.reduce((s, i) => s + i.qty, 0)
  const total = computeTotal(state.items)
  if (state.items.length === 0) return null
  return (
    <div className="sticky bottom-0 z-20 border-t bg-background">
      <button
        type="button"
        onClick={onOpenCart}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 active:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <ShoppingCart className="size-5" strokeWidth={1.75} />
          <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
            {count}
          </span>
          <span className="text-sm font-medium">View cart</span>
        </span>
        <span className="font-mono text-base font-bold">{formatUgxTotal(total)}</span>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/cart-bar.tsx
git commit -m "feat(pos): sticky CartBar with count badge + total"
```

---

### Task 13: `VariantPickerSheet` (3-step)

**Files:**
- Create: `src/components/pos/variant-picker-sheet.tsx`

- [ ] **Step 1: Implement the sheet**

```tsx
// src/components/pos/variant-picker-sheet.tsx
import * as React from "react"
import BigNumber from "bignumber.js"
import { ArrowLeft, ArrowRight, Plus, Minus } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { Label } from "#/components/ui/label"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { useCart } from "#/components/pos/cart-context"
import { productImageUrl } from "#/lib/products"
import { formatUgx, formatUgxTotal } from "#/lib/format"
import { cn } from "#/lib/utils"
import type { AggregatedProduct, AggregatedColor } from "#/lib/products"

type StockRow = {
  id: string
  productColorId: string
  size: string
  quantityOnHand: number
  minimumSellPriceUgx: string
}

type Props = {
  product: AggregatedProduct | null
  stock: StockRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 1 | 2 | 3

export function VariantPickerSheet({ product, stock, open, onOpenChange }: Props) {
  const { add } = useCart()
  const [step, setStep] = React.useState<Step>(1)
  const [colorId, setColorId] = React.useState<string | null>(null)
  const [size, setSize] = React.useState<string | null>(null)
  const [qty, setQty] = React.useState(1)
  const [price, setPrice] = React.useState("")
  const [reason, setReason] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setStep(1)
    setColorId(null)
    setSize(null)
    setQty(1)
    setPrice("")
    setReason("")
  }, [open, product?.product.articleNumber])

  if (!product) return null

  const availableColors = product.colors
  const availableSizes = product.product.sizes
  const variantRow = (cid: string | null, sz: string | null) =>
    cid && sz
      ? stock.find((s) => s.productColorId === cid && s.size === sz) ?? null
      : null

  const currentRow = variantRow(colorId, size)
  const stockForColor = (cid: string) => stock.filter((s) => s.productColorId === cid && s.quantityOnHand > 0)
  const sizeAvailableForColor = (cid: string, sz: string) => {
    const r = stock.find((s) => s.productColorId === cid && s.size === sz)
    return r ? r.quantityOnHand > 0 : false
  }

  React.useEffect(() => {
    if (!currentRow) return
    if (price === "") setPrice(currentRow.minimumSellPriceUgx)
  }, [currentRow?.id])

  function pickColor(cid: string) {
    setColorId(cid)
    setSize(null)
    setQty(1)
    setPrice("")
    setReason("")
    setStep(2)
  }

  function pickSize(sz: string) {
    setSize(sz)
    setStep(3)
  }

  function addItem() {
    if (!currentRow || !colorId || !size) return
    const color = product.colors.find((c) => c.productColorId === colorId) as AggregatedColor
    const label = `${product.product.articleNumber} · ${product.product.name} — ${color.colorName} / ${size}`
    add({
      shopStockId: currentRow.id,
      productLabel: label,
      imageUrl: color.imageS3Key ? productImageUrl(color.imageS3Key) : null,
      colorHex: color.colorHex,
      qty,
      unitPriceUgx: price,
      minimumSellPriceUgx: currentRow.minimumSellPriceUgx,
      belowMinimumReason: reason.trim(),
      availableQty: currentRow.quantityOnHand,
    })
    onOpenChange(false)
  }

  const min = currentRow ? new BigNumber(currentRow.minimumSellPriceUgx) : new BigNumber(0)
  const priceBn = new BigNumber(price || 0)
  const isBelowMin = currentRow != null && priceBn.gt(0) && priceBn.lt(min)
  const canAdd = !!currentRow && qty >= 1 && priceBn.gt(0) && (!isBelowMin || reason.trim().length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {product.product.name} · {product.product.articleNumber}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
        </SheetHeader>

        {step === 1 && (
          <div className="space-y-3 px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick a color</p>
            <div className="grid grid-cols-4 gap-3">
              {availableColors.map((c) => {
                const hasStock = stockForColor(c.productColorId).length > 0
                return (
                  <button
                    key={c.productColorId}
                    type="button"
                    disabled={!hasStock}
                    onClick={() => pickColor(c.productColorId)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 disabled:opacity-30",
                      colorId === c.productColorId && "border-foreground",
                    )}
                  >
                    <span className="size-10 rounded-md border" style={{ backgroundColor: c.colorHex }} aria-hidden />
                    <span className="truncate text-xs">{c.colorName}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && colorId && (
          <div className="space-y-3 px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick a size</p>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((sz) => {
                const avail = sizeAvailableForColor(colorId, sz)
                return (
                  <button
                    key={sz}
                    type="button"
                    disabled={!avail}
                    onClick={() => pickSize(sz)}
                    className={cn(
                      "h-11 min-w-[3.5rem] rounded-lg border px-4 font-semibold disabled:line-through disabled:opacity-30",
                      size === sz && "border-foreground bg-foreground text-background",
                    )}
                  >
                    {sz}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 3 && currentRow && (
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label>Quantity ({currentRow.quantityOnHand} in stock)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-11"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="h-11 w-20 text-center text-base"
                  value={qty}
                  min={1}
                  max={currentRow.quantityOnHand}
                  onChange={(e) => setQty(Math.max(1, Math.min(currentRow.quantityOnHand, Number(e.target.value) || 1)))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-11"
                  onClick={() => setQty((q) => Math.min(currentRow.quantityOnHand, q + 1))}
                  disabled={qty >= currentRow.quantityOnHand}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Price per unit (min {formatUgx(currentRow.minimumSellPriceUgx)})</Label>
              <MoneyInput
                currency="UGX"
                roundTo={50}
                className="h-11 text-base"
                value={price}
                onChange={setPrice}
              />
            </div>

            {isBelowMin && (
              <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <Label className="text-xs text-amber-900">Reason for selling below {formatUgx(currentRow.minimumSellPriceUgx)}</Label>
                <Input
                  className="h-10 bg-background text-sm"
                  placeholder="e.g. customer haggled"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background px-4 py-3">
          {step > 1 && (
            <Button variant="outline" className="h-11" onClick={() => setStep((s) => (s - 1) as Step)}>
              <ArrowLeft className="mr-1 size-4" /> Back
            </Button>
          )}
          {step < 3 && (
            <Button
              className="h-11 flex-1"
              disabled={step === 1 ? !colorId : !size}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next <ArrowRight className="ml-1 size-4" />
            </Button>
          )}
          {step === 3 && (
            <Button
              className="h-11 flex-1 bg-green-600 text-white hover:bg-green-700"
              disabled={!canAdd}
              onClick={addItem}
            >
              Add · {formatUgxTotal(priceBn.times(qty))}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/variant-picker-sheet.tsx
git commit -m "feat(pos): stepped VariantPickerSheet (color → size → qty+price)"
```

---

### Task 14: `CartSheet`

**Files:**
- Create: `src/components/pos/cart-sheet.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/pos/cart-sheet.tsx
import { Trash2, Plus, Minus, ArrowRight } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { formatUgxTotal } from "#/lib/format"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckout: () => void
}

export function CartSheet({ open, onOpenChange, onCheckout }: Props) {
  const { state, remove, updateQty } = useCart()
  const total = computeTotal(state.items)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cart · {state.items.length} {state.items.length === 1 ? "item" : "items"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-4">
          {state.items.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">Your cart is empty.</p>
          )}
          {state.items.map((i) => (
            <div key={i.shopStockId} className="flex items-center gap-3 rounded-lg border p-3">
              <div
                className="size-12 shrink-0 rounded-md border"
                style={{ backgroundColor: i.colorHex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.productLabel}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {i.qty} × {formatUgxTotal(i.unitPriceUgx)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => updateQty(i.shopStockId, i.qty - 1)}
                  disabled={i.qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-5 text-center text-sm font-semibold">{i.qty}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => updateQty(i.shopStockId, i.qty + 1)}
                  disabled={i.qty >= i.availableQty}
                  aria-label="Increase quantity"
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i.shopStockId)}
                  aria-label={`Remove ${i.productLabel}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {state.items.length > 0 && (
          <div className="sticky bottom-0 space-y-3 border-t bg-background px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-mono text-xl font-bold">{formatUgxTotal(total)}</span>
            </div>
            <Button className="h-12 w-full text-base" onClick={onCheckout}>
              Checkout <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/cart-sheet.tsx
git commit -m "feat(pos): CartSheet with qty steppers and checkout CTA"
```

---

### Task 15: `CheckoutSheet` (3-step)

**Files:**
- Create: `src/components/pos/checkout-sheet.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/pos/checkout-sheet.tsx
import * as React from "react"
import { ArrowLeft, ArrowRight, Banknote, Landmark, CheckCircle2, Plus, Printer } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { validateCartForCheckout } from "#/lib/pos/checkout-validate"
import { formatUgxTotal } from "#/lib/format"
import { recordSale } from "#/server/functions/shop/sales"
import { cn } from "#/lib/utils"

type Stage = "payment" | "confirm" | "success"

type Props = {
  shopId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaleComplete: () => void
}

export function CheckoutSheet({ shopId, open, onOpenChange, onSaleComplete }: Props) {
  const { state, clear } = useCart()
  const [stage, setStage] = React.useState<Stage>("payment")
  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "bank">("cash")
  const [submitting, setSubmitting] = React.useState(false)
  const [completedSaleId, setCompletedSaleId] = React.useState<string | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setStage("payment")
      setErrorMsg(null)
      setCompletedSaleId(null)
    }
  }, [open])

  const total = computeTotal(state.items)

  async function handleConfirm() {
    const validation = validateCartForCheckout(state.items)
    if (!validation.ok) {
      setErrorMsg("Some items are invalid. Re-check qty, price, or reason.")
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await recordSale({
        data: {
          shopId,
          paymentMethod,
          items: state.items.map((i) => ({
            shopStockId: i.shopStockId,
            quantity: i.qty,
            unitPriceUgx: i.unitPriceUgx,
            belowMinimumReason: i.belowMinimumReason.trim() || undefined,
          })),
        },
      })
      setCompletedSaleId(res.id ?? "unknown")
      setStage("success")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to record sale")
    } finally {
      setSubmitting(false)
    }
  }

  function handleNewSale() {
    clear()
    onSaleComplete()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {stage === "payment" && "Payment"}
            {stage === "confirm" && "Confirm sale"}
            {stage === "success" && "Sale recorded"}
          </SheetTitle>
          {stage !== "success" && <p className="text-xs text-muted-foreground">Step {stage === "payment" ? 1 : 2} of 2</p>}
        </SheetHeader>

        {stage === "payment" && (
          <div className="space-y-3 px-4">
            <p className="text-sm text-muted-foreground">
              {state.items.length} {state.items.length === 1 ? "item" : "items"} · {formatUgxTotal(total)} total
            </p>
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left",
                paymentMethod === "cash" ? "border-green-600 bg-green-50" : "border-border bg-background",
              )}
            >
              <div className="grid size-12 place-items-center rounded-lg bg-muted">
                <Banknote className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Cash</p>
                <p className="text-xs text-muted-foreground">Money received now</p>
              </div>
              {paymentMethod === "cash" && <CheckCircle2 className="size-5 text-green-600" />}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("bank")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left",
                paymentMethod === "bank" ? "border-green-600 bg-green-50" : "border-border bg-background",
              )}
            >
              <div className="grid size-12 place-items-center rounded-lg bg-muted">
                <Landmark className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Bank</p>
                <p className="text-xs text-muted-foreground">Mobile money, card, transfer</p>
              </div>
              {paymentMethod === "bank" && <CheckCircle2 className="size-5 text-green-600" />}
            </button>
          </div>
        )}

        {stage === "confirm" && (
          <div className="space-y-3 px-4">
            {state.items.map((i) => (
              <div key={i.shopStockId} className="flex justify-between border-b py-2 text-sm">
                <span className="truncate pr-3">
                  {i.qty}× {i.productLabel}
                </span>
                <span className="font-mono">{formatUgxTotal(Number(i.unitPriceUgx) * i.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 text-sm">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-semibold capitalize">{paymentMethod}</span>
            </div>
            <div className="flex justify-between border-t-2 pt-2">
              <span className="font-bold">Total</span>
              <span className="font-mono text-xl font-bold">{formatUgxTotal(total)}</span>
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        {stage === "success" && (
          <div className="space-y-4 px-4 py-6 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-green-600 text-white">
              <CheckCircle2 className="size-9" />
            </div>
            <div>
              <p className="text-lg font-bold">Sale recorded</p>
              <p className="font-mono text-xs text-muted-foreground">#{completedSaleId?.slice(0, 8) ?? "—"}</p>
            </div>
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-semibold">{state.items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-semibold capitalize">{paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">{formatUgxTotal(total)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Button variant="outline" className="h-12 w-full" disabled>
                <Printer className="mr-2 size-4" /> Print receipt (next feature)
              </Button>
              <Button className="h-12 w-full" onClick={handleNewSale}>
                <Plus className="mr-2 size-4" /> New sale
              </Button>
            </div>
          </div>
        )}

        {stage !== "success" && (
          <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background px-4 py-3">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                if (stage === "payment") onOpenChange(false)
                else setStage("payment")
              }}
            >
              <ArrowLeft className="mr-1 size-4" /> Back
            </Button>
            {stage === "payment" && (
              <Button className="h-11 flex-1" onClick={() => setStage("confirm")}>
                Next <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
            {stage === "confirm" && (
              <Button
                className="h-11 flex-1 bg-green-600 text-white hover:bg-green-700"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? "Recording..." : "Confirm sale ✓"}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

If `recordSale` return type doesn't include `id`, fix the destructuring in `handleConfirm` to ignore the return value and use a generated UUID for display, or update `recordSale` to return `{ id }` (check server function first).

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/checkout-sheet.tsx
git commit -m "feat(pos): 3-step CheckoutSheet (payment → confirm → success)"
```

---

## Phase 4 — Wire up POS

### Task 16: `/pos` route + `PosLayout`

**Files:**
- Create: `src/routes/pos.tsx`
- Create: `src/components/pos/pos-layout.tsx`

- [ ] **Step 1: Implement `PosLayout`**

```tsx
// src/components/pos/pos-layout.tsx
import * as React from "react"

export function PosLayout({ header, children, footer }: {
  header: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {header}
      <main className="flex-1 overflow-y-auto px-3 py-3">{children}</main>
      {footer}
    </div>
  )
}
```

- [ ] **Step 2: Implement `/pos` route**

```tsx
// src/routes/pos.tsx
import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { requireUiPermission } from "#/lib/permissions"
import { getShopStock } from "#/server/functions/shop/sales"
import { getSession } from "#/server/middleware/auth"
import { aggregateStockByArticle } from "#/lib/products"
import { CartProvider, useCart } from "#/components/pos/cart-context"
import { PosLayout } from "#/components/pos/pos-layout"
import { PosHeader } from "#/components/pos/pos-header"
import { ProductGrid } from "#/components/pos/product-grid"
import { CartBar } from "#/components/pos/cart-bar"
import { CartSheet } from "#/components/pos/cart-sheet"
import { CheckoutSheet } from "#/components/pos/checkout-sheet"
import { VariantPickerSheet } from "#/components/pos/variant-picker-sheet"
import type { AggregatedProduct } from "#/lib/products"

type ShopStockRow = Awaited<ReturnType<typeof getShopStock>>[number]

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => requireUiPermission(context, "pos.view"),
  loader: async () => {
    const session = await getSession()
    const user = session?.user as { name?: string; email?: string; shopId?: string | null } | undefined
    if (!user?.shopId) {
      throw new Error("No shop assigned to this user. Ask an admin to assign you a shop.")
    }
    const stock = await getShopStock({ data: { shopId: user.shopId } })
    return {
      shopId: user.shopId,
      userName: user.name ?? "User",
      userEmail: user.email ?? "",
      stock,
    }
  },
  component: PosPage,
})

function PosPage() {
  const { shopId } = Route.useLoaderData()
  return (
    <CartProvider storageKey={`pos-cart:${shopId}`}>
      <PosInner />
    </CartProvider>
  )
}

function PosInner() {
  const { shopId, userName, userEmail, stock } = Route.useLoaderData()
  const router = Route.useRouter()
  const [query, setQuery] = React.useState("")
  const [picked, setPicked] = React.useState<AggregatedProduct | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [cartOpen, setCartOpen] = React.useState(false)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const { state } = useCart()

  const aggregated = React.useMemo(() => aggregateStockByArticle(stock as ShopStockRow[]), [stock])
  const stockRows = React.useMemo(
    () =>
      stock.map((s) => ({
        id: s.id,
        productColorId: s.productColor.productColorId,
        size: s.size,
        quantityOnHand: s.quantityOnHand,
        minimumSellPriceUgx: s.minimumSellPriceUgx,
      })),
    [stock],
  )

  function handlePick(p: AggregatedProduct) {
    setPicked(p)
    setPickerOpen(true)
  }

  function handleSaleComplete() {
    router.invalidate()
  }

  return (
    <PosLayout
      header={<PosHeader query={query} onQueryChange={setQuery} userName={userName} userEmail={userEmail} />}
      footer={<CartBar onOpenCart={() => setCartOpen(true)} />}
    >
      <ProductGrid products={aggregated} query={query} onPick={handlePick} />

      <VariantPickerSheet
        product={picked}
        stock={stockRows}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
      />
      <CheckoutSheet
        shopId={shopId}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onSaleComplete={handleSaleComplete}
      />
    </PosLayout>
  )
}
```

Note: `Route.useRouter` may not exist; if so, use `import { useRouter } from "@tanstack/react-router"` and call `useRouter()` instead.

If `s.productColor.productColorId` doesn't match the actual stock shape (productColor.id vs productColorId), inspect `ShopStockItem` in `src/server/functions/shop/sales.ts` and adapt.

- [ ] **Step 3: Inspect `getShopStock` return shape**

Run: `grep -n "getShopStock\|productColor\|productColorId" src/server/functions/shop/sales.ts | head -20`

Adapt `stockRows` mapping to match the actual return type. The `productColorId` field on `ShopStockItem` may be a top-level field rather than nested.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit -p . && pnpm dev` (in another terminal: open localhost:3000/pos as sales role).

- [ ] **Step 5: Commit**

```bash
git add src/routes/pos.tsx src/components/pos/pos-layout.tsx
git commit -m "feat(pos): wire /pos route assembling all POS components"
```

---

### Task 17: Cypress E2E for mobile POS

**Files:**
- Create: `cypress/e2e/08-mobile-pos.cy.ts`

- [ ] **Step 1: Write the spec**

```ts
// cypress/e2e/08-mobile-pos.cy.ts
/**
 * Mobile POS happy path.
 * - Sets viewport to iPhone 14 (390×844).
 * - Signs up a sales user, assigns a shop with stock.
 * - Logs in → auto-redirected to /pos.
 * - Picks product → color → size → qty/price → add to cart.
 * - Opens cart, edits qty, checks out via cash.
 * - Verifies sale shows up in /shop/sales for admin.
 */
describe("Mobile POS happy path", () => {
  const salesEmail = `e2e-pos-${Date.now()}@test.com`
  const adminEmail = `e2e-pos-admin-${Date.now()}@test.com`
  const password = "E2EPassword123!"

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.signup("POS Sales", salesEmail, password)
    cy.signup("POS Admin", adminEmail, password)
    cy.task("dbQuery", `UPDATE "user" SET role = 'admin' WHERE email = '${adminEmail}'`)

    // Seed minimal data: supplier, shop, product+color+stock
    cy.task("dbQuery", `INSERT INTO suppliers (name, country) VALUES ('S', 'CN') ON CONFLICT DO NOTHING`)
    cy.task(
      "dbQuery",
      `INSERT INTO shops (name, address) VALUES ('POS Shop', 'Kampala') ON CONFLICT DO NOTHING`,
    )
    cy.task(
      "dbQuery",
      `UPDATE "user" SET role = 'sales', shop_id = (SELECT id::text FROM shops WHERE name = 'POS Shop' LIMIT 1) WHERE email = '${salesEmail}'`,
    )
    cy.task(
      "dbQuery",
      `INSERT INTO products (article_number, name, sizes) VALUES ('TR-POS', 'POS Crew Tee', ARRAY['S','M','L']) ON CONFLICT DO NOTHING`,
    )
    cy.task(
      "dbQuery",
      `INSERT INTO product_colors (product_id, color_name, color_hex)
       SELECT id, 'Red', '#dc2626' FROM products WHERE article_number = 'TR-POS'
       ON CONFLICT DO NOTHING`,
    )
    cy.task(
      "dbQuery",
      `INSERT INTO shop_stock (shop_id, product_color_id, size, quantity_on_hand, weighted_avg_cost_ugx, minimum_sell_price_ugx)
       SELECT
         (SELECT id FROM shops WHERE name = 'POS Shop' LIMIT 1),
         (SELECT pc.id FROM product_colors pc JOIN products p ON p.id = pc.product_id WHERE p.article_number = 'TR-POS' AND pc.color_name = 'Red'),
         'M',
         10,
         30000,
         50000
       ON CONFLICT DO NOTHING`,
    )
  })

  beforeEach(() => {
    cy.viewport(390, 844)
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("creates a sale via the mobile POS flow", () => {
    cy.loginAndCache(salesEmail, password)
    cy.visit("/pos")
    cy.location("pathname", { timeout: 5000 }).should("eq", "/pos")

    // Search filters
    cy.get('input[aria-label="Search products"]').type("POS")
    cy.contains("POS Crew Tee").should("exist")

    // Tap product → variant sheet
    cy.contains("POS Crew Tee").click()
    cy.contains("Step 1 of 3").should("exist")

    // Pick Red
    cy.contains("Red").click()
    cy.contains("Step 2 of 3").should("exist")

    // Pick M
    cy.contains("button", "M").click()
    cy.contains("Step 3 of 3").should("exist")

    // Qty 2, price default
    cy.contains("button", "+").click() // qty 2
    cy.contains("button", /Add ·/i).click()

    // Cart bar visible
    cy.contains("View cart").click()

    // Checkout
    cy.contains("button", "Checkout").click()
    cy.contains("Cash").click()
    cy.contains("button", "Next").click()
    cy.contains("button", /Confirm sale/i).click()

    cy.contains("Sale recorded", { timeout: 8000 }).should("exist")
  })

  it("admin sees the sale in /shop/sales", () => {
    cy.loginAndCache(adminEmail, password)
    cy.visit("/shop/sales")
    cy.contains("POS Crew Tee").should("exist")
  })
})
```

- [ ] **Step 2: Verify against running dev server**

In one terminal:
```bash
pnpm dev
```

In another:
```bash
pnpm cypress run --spec cypress/e2e/08-mobile-pos.cy.ts
```

If selectors miss, iterate the spec (not the production code) until it passes.

- [ ] **Step 3: Commit**

```bash
git add cypress/e2e/08-mobile-pos.cy.ts
git commit -m "test(e2e): mobile POS happy path with viewport 390x844"
```

---

## Phase 5 — Comprehensive mobile-optimize

For each existing screen, swap `Dialog` for `ResponsiveDialog` and tables for `ResponsiveTable`. Verify each one after editing.

### Task 18: `/shop/index.tsx` — use ResponsiveDialog for new-sale & receive-transfer

**Files:**
- Modify: `src/routes/shop/index.tsx`

- [ ] **Step 1: Read the current file** (~700 lines)

- [ ] **Step 2: Replace `Dialog` imports with `ResponsiveDialog`**

Replace these lines (around 22-28):

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
```

With:

```tsx
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "#/components/ui/responsive-dialog"
import { DialogTrigger } from "#/components/ui/dialog"
```

Note: `DialogTrigger` from base Dialog stays — Sheet has its own trigger, but the wrapper auto-detects open state.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p . && pnpm dev` and visually verify the New Sale dialog renders as a bottom sheet at viewport ≤767px.

- [ ] **Step 4: Commit**

```bash
git add src/routes/shop/index.tsx
git commit -m "feat(shop): use ResponsiveDialog for sale and transfer modals"
```

---

### Task 19: `/shop/sales.tsx` — table → ResponsiveTable

**Files:**
- Modify: `src/routes/shop/sales.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Replace the `Table` block with `ResponsiveTable`**

Replace lines ~137-201 (the `<div className="rounded-md border"><Table>...</Table></div>` block) with:

```tsx
<ResponsiveTable<typeof sales[number]>
  data={sales}
  getRowKey={(s) => s.id}
  columns={[
    {
      header: "Date",
      mobileLabel: "Date",
      cell: (s) => new Date(s.saleDate).toLocaleString(),
    },
    {
      header: "Items",
      mobileLabel: "Items",
      align: "left",
      cell: (s) => (
        <div className="flex flex-col gap-1">
          {s.items.map((i, idx) => {
            const pc = i.shopStockItem.productColor
            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="font-mono">{i.quantity}x {pc.product.articleNumber}</span>
                <span className="text-muted-foreground">{pc.product.name}</span>
                <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: pc.colorHex }} aria-hidden />
                <span className="text-muted-foreground text-xs">{pc.colorName} / {i.shopStockItem.size}</span>
              </div>
            )
          })}
        </div>
      ),
    },
    {
      header: "Payment",
      cell: (s) => <Badge variant="outline">{s.paymentMethod}</Badge>,
    },
    {
      header: "Amount (UGX)",
      align: "right",
      cell: (s) => (
        <span className="font-mono font-semibold">{roundUgxFloor50(s.totalAmount).toFormat(0)}</span>
      ),
    },
    {
      header: "Flags",
      cell: (s) => s.items.some((i) => i.isBelowMinimum) ? <Badge variant="destructive">Below min</Badge> : null,
    },
  ]}
  emptyMessage="No sales recorded yet for this shop."
/>
```

Import `ResponsiveTable` from `#/components/ui/responsive-table`. Remove unused `Table*` imports.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/routes/shop/sales.tsx
git commit -m "feat(shop/sales): render sales as cards on mobile"
```

---

### Task 20: Supply route detail — dialogs + tables responsive

**Files:**
- Modify: `src/routes/supply/$routeId.tsx`
- Modify any sub-components used (e.g., `src/components/supply/*.tsx`)

- [ ] **Step 1: Read the file and identify all `Dialog` and `Table` usages**

- [ ] **Step 2: Apply the same swap pattern as Tasks 18 and 19**

Replace `Dialog/DialogContent/DialogHeader/DialogTitle` imports with `ResponsiveDialog*` aliases. Replace any `<Table>` block listing route items, supply route expenses, or supplier rows with `ResponsiveTable` configured with the existing columns.

For inline forms (e.g., "Add Item" form inside the dialog), ensure inputs are `h-11 text-base` and the primary CTA is sticky-bottom via `<div className="sticky bottom-0 -mx-6 -mb-6 ...">`.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/routes/supply src/components/supply
git commit -m "feat(supply): mobile-optimize route detail dialogs and tables"
```

---

### Task 21: Store screens — dialogs + tables responsive

**Files:**
- Modify: `src/routes/store/index.tsx`
- Modify: `src/routes/store/opening-balance.tsx` (already-mobile review)
- Modify: any related components (`receiving-form.tsx`, `transfers/*`)

- [ ] **Step 1: Apply the same swap pattern**

Replace Dialog imports with ResponsiveDialog aliases; replace Table blocks with ResponsiveTable. For the receiving form and dispatch flow, ensure forms have `h-11 text-base` and sticky-bottom CTAs.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/routes/store src/components/transfers
git commit -m "feat(store): mobile-optimize store dashboards and forms"
```

---

### Task 22: Opening-balance forms — mobile layout

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx`

- [ ] **Step 1: Audit existing layout**

This form has multi-block draft list with product picker + variant grid. On mobile:
- Each draft block becomes a stacked card (already mostly stacked)
- Picker → full-screen Sheet via ResponsiveDialog
- Variant grid: horizontal scroll inside a `overflow-x-auto` container (sizes column header stays visible)
- "Save" → sticky bottom on mobile

- [ ] **Step 2: Wrap variant grid in scroll container**

Locate the variant grid render. Wrap with:

```tsx
<div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
  <VariantGrid ... />
</div>
```

Wrap the submit button in a sticky-bottom container at mobile breakpoint:

```tsx
<div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-3 md:static md:mx-0 md:mb-0 md:border-t-0 md:bg-transparent md:p-0">
  <Button className="h-12 w-full md:h-10 md:w-auto" onClick={handleSubmit}>Save</Button>
</div>
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/components/opening-balance/opening-balance-form.tsx
git commit -m "feat(opening-balance): mobile-friendly variant grid and sticky save"
```

---

### Task 23: Product/Color editor dialogs — responsive

**Files:**
- Modify: `src/components/products/product-editor.tsx`
- Modify: `src/components/products/color-editor.tsx`

- [ ] **Step 1: Swap Dialog imports for ResponsiveDialog**

Same pattern as Task 18.

- [ ] **Step 2: Ensure inputs are `h-11 text-base` on mobile**

Add `text-base` to any `Input`/`Textarea`/`MoneyInput` lacking it.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/components/products
git commit -m "feat(products): responsive editors with larger touch inputs"
```

---

### Task 24: Receive-transfer form — mobile layout

**Files:**
- Modify: `src/components/transfers/receive-transfer-form.tsx`

- [ ] **Step 1: Audit**

- [ ] **Step 2: Apply mobile patterns**

- Inputs `h-11 text-base`
- Submit button sticky-bottom on mobile
- Item list: vertical stacked cards (already vertical typically)

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/components/transfers
git commit -m "feat(transfers): mobile-optimize receive transfer form"
```

---

### Task 25: Customers tables — responsive

**Files:**
- Modify: `src/routes/customers/index.tsx`
- Modify: `src/routes/customers/$customerId.tsx`

- [ ] **Step 1: Apply ResponsiveTable swap**

Replace customer list table with `ResponsiveTable`. Replace customer payments / sales tables on detail page same way. Use `onRowClick` for navigation where present.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/routes/customers
git commit -m "feat(customers): mobile card list and detail tables"
```

---

### Task 26: Reports tables — responsive

**Files:**
- Modify: `src/routes/reports/*.tsx`

- [ ] **Step 1: Apply ResponsiveTable swap to every table**

Tables in reports often have many columns; on mobile, drop low-priority columns via `hideOnMobile: true`. Keep date, amount, primary-label columns.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 3: Commit**

```bash
git add src/routes/reports
git commit -m "feat(reports): mobile-optimize tables with column hiding"
```

---

### Task 27: Cypress E2E for admin mobile screens

**Files:**
- Create: `cypress/e2e/09-mobile-admin-screens.cy.ts`

- [ ] **Step 1: Write the spec**

```ts
// cypress/e2e/09-mobile-admin-screens.cy.ts
/**
 * Mobile admin screens.
 * - viewport 390×844
 * - logs in as admin
 * - walks through key screens and asserts no horizontal overflow,
 *   dialogs render as full-screen sheets, tables render as cards.
 */
describe("Admin screens on mobile", () => {
  const email = `e2e-admin-mobile-${Date.now()}@test.com`
  const password = "E2EPassword123!"

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.signup("Admin Mobile", email, password)
    cy.task("dbQuery", `UPDATE "user" SET role = 'admin' WHERE email = '${email}'`)
  })

  beforeEach(() => {
    cy.viewport(390, 844)
    cy.loginAndCache(email, password)
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("sidebar opens as a drawer", () => {
    cy.visit("/")
    cy.get('button[aria-label*="menu" i]').first().click()
    cy.contains("Supply").should("be.visible")
  })

  it("shop sales renders as cards (no <table>)", () => {
    cy.visit("/shop/sales")
    cy.get("table").should("not.exist")
  })

  it("supply routes page works without horizontal scroll", () => {
    cy.visit("/supply")
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth + 1)
    })
  })

  it("store opening balance form usable", () => {
    cy.visit("/store/opening-balance")
    cy.contains(/opening balance/i).should("be.visible")
  })
})
```

- [ ] **Step 2: Verify**

Run: `pnpm dev` in one terminal, then:
```bash
pnpm cypress run --spec cypress/e2e/09-mobile-admin-screens.cy.ts
```

- [ ] **Step 3: Commit**

```bash
git add cypress/e2e/09-mobile-admin-screens.cy.ts
git commit -m "test(e2e): admin mobile screens smoke at 390x844"
```

---

## Phase 6 — Polish & final verification

### Task 28: InfoTip entries for new POS UI

**Files:**
- Modify: `src/lib/help-dictionary.ts`

- [ ] **Step 1: Add new dictionary entries**

```ts
"pos.search": {
  title: "Search products",
  body: "Type article number or product name to filter the grid.",
},
"pos.cart": {
  title: "Cart",
  body: "Items you've added but haven't checked out yet. Tap to expand.",
},
"pos.variant": {
  title: "Variant",
  body: "A specific color and size combination. Stock is tracked per variant.",
},
"pos.belowMin": {
  title: "Below-minimum sale",
  body: "Selling below the recommended minimum price. A reason is required so the admin can review.",
},
```

- [ ] **Step 2: Wire InfoTips into the components**

Add `<InfoTip term="pos.belowMin" />` next to the below-minimum reason input in `variant-picker-sheet.tsx`. Add `<InfoTip term="pos.cart" />` next to the "View cart" label in `cart-bar.tsx` (small, end of label).

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit -p .`

- [ ] **Step 4: Commit**

```bash
git add src/lib/help-dictionary.ts src/components/pos
git commit -m "docs(help): InfoTips for POS search, cart, variant, below-min"
```

---

### Task 29: Full verification & wrap-up

**Files:** (no edits; verification only)

- [ ] **Step 1: Run full vitest suite**

Run: `pnpm test`
Expected: all green (existing + new tests).

- [ ] **Step 2: Run full typecheck**

Run: `pnpm tsc --noEmit -p .`
Expected: zero errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: zero errors.

- [ ] **Step 4: Run all Cypress E2E**

In one terminal: `pnpm dev`
In another:
```bash
pnpm cypress run
```
Expected: all specs pass including 08 and 09.

- [ ] **Step 5: Manual smoke**

`pnpm dev` → http://localhost:3000

- Log in as admin → confirm everything still works on desktop.
- Resize to ~390px → confirm dialogs render as bottom sheets, tables render as cards, no horizontal overflow.
- Log in as sales user (set role via `psql`) → confirm auto-redirect to `/pos`, full sale flow works end-to-end.

- [ ] **Step 6: Final commit if any polish edits**

```bash
git add -A
git commit -m "chore: final polish for mobile POS feature"
```

---

## Self-review checklist

After all tasks done:

- [ ] No `Dialog` usages remain in screens listed in Phase 5 (use `grep -r 'from "#/components/ui/dialog"' src/routes src/components/{opening-balance,transfers,products,shops,supply}` to verify — the only matches should be `DialogTrigger` which still imports from the base file).
- [ ] No `<Table>` usages remain in user-facing list pages (the `Table` primitive may still be imported by `ResponsiveTable` itself).
- [ ] Sales role auto-redirected, sidebar pruned.
- [ ] localStorage cart survives refresh.
- [ ] Cypress 08 and 09 green.

---

## Notes for the engineer

- **Tooling assumption:** `pnpm` for all commands. `pnpm dev` boots the TanStack Start dev server on port 3000.
- **Database:** `psql -d inventory` for the dev DB; `cy.task("dbQuery", ...)` for the test DB.
- **Permissions:** the source of truth is `src/lib/permissions.ts`. If you add server functions called from the new UI, they must already have `requireRole(...)` — none of these tasks adds new server functions, so existing gates apply.
- **shadcn:** components live in `src/components/ui/`. Use the existing primitives; don't `npx shadcn add` new ones without flagging.
- **Don't add `vaul` or any new bottom-sheet library** — shadcn `Sheet` with `side="bottom"` is the chosen primitive.
- **`@vitest-environment jsdom`** must appear on the first line of any `.tsx` test that uses `@testing-library/react`. The default env is `node`.
- **Cypress mobile viewport:** set per-spec in `beforeEach`. Don't change `cypress.config.ts` default viewport (other specs depend on it).
- **Routes are file-based:** `src/routes/pos.tsx` auto-generates the `/pos` route. The route tree is regenerated by the dev server / build.
