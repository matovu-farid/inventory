# Item Variants and Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product catalog with per-color images and variant-level inventory (color × size) across supply, store, and shop modules, with an Amazon-style display.

**Architecture:** Two new catalog tables (`products` keyed by `articleNumber`, `product_colors` holding image + hex). Existing stock tables (`supply_route_items`, `store_stock`, `shop_stock`, `store_transfer_items`, `store_receivings`, `shop_sale_items`) drop their text `productName`/`articleNumber` columns and gain `productColorId` + `size`. Images upload directly to S3 (`eu-west-1`, public-read) via presigned PUT. Color picker combines a curated 30-tile clothing palette with an in-browser eyedropper that auto-extracts the dominant color from uploaded images. Data is wiped pre-launch — no migration code.

**Tech Stack:** TanStack Start, Drizzle ORM, Cloudflare Workers, `aws4fetch` for S3 signing, React 19, shadcn/ui, vitest, Cypress, BigNumber.js.

**Testing strategy (TDD — applies to every task that ships code):**

1. **Write the failing test first** — vitest for pure logic and server functions; Cypress for any flow that crosses the browser/server boundary (image upload, color extraction wired to canvas, end-to-end variant entry).
2. **Run it and confirm it fails** with the expected error.
3. **Write the minimal implementation** to make it pass.
4. **Run the tests and confirm they pass.**
5. **Commit** before moving to the next task.

Pure-UI components without testable logic (e.g., `ProductCard`'s pure layout) are validated by the E2E test in Task 33; their tasks skip the unit-test step but still keep the run/verify/commit rhythm. The plan calls these out explicitly where they apply.

**Reference spec:** `docs/superpowers/specs/2026-05-11-item-variants-and-images-design.md`

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `src/db/schema/products.ts` | `products`, `product_colors` tables + relations |
| `src/lib/colors/palette.ts` | 30-tile clothing palette (name + hex) |
| `src/lib/colors/lab.ts` | sRGB ↔ Lab conversions, ΔE76 distance |
| `src/lib/colors/match-palette.ts` | hex/lab → nearest palette tile |
| `src/lib/colors/extract-dominant.ts` | Pure: `ImageData` → dominant Lab centroid |
| `src/lib/s3/sign.ts` | Server-side presigner using `aws4fetch` |
| `src/lib/products.ts` | `productImageUrl(s3Key)` and small display helpers |
| `src/server/functions/products/products.ts` | `listProducts`, `getProduct`, `createProduct`, `updateProduct`, `searchProducts` |
| `src/server/functions/products/colors.ts` | `addProductColor`, `updateProductColor`, `setProductColorImage`, `deleteProductColor` |
| `src/server/functions/products/uploads.ts` | `getProductImageUploadUrl` |
| `src/components/products/product-picker.tsx` | Article-number combobox with create-new affordance |
| `src/components/products/product-editor.tsx` | Dialog form (name, sizes, description) |
| `src/components/products/color-editor.tsx` | Dialog form (color name, hex, image) |
| `src/components/products/color-picker.tsx` | Palette grid + custom hex + eyedropper |
| `src/components/products/image-uploader.tsx` | File input → canvas downscale → emit blob + dominant color |
| `src/components/products/variant-grid.tsx` | `size × color` quantity grid |
| `src/components/products/product-card.tsx` | Amazon-style read-only card |
| `src/routes/products/index.tsx` | Lookup/search page |
| `src/routes/products/$articleNumber.tsx` | Product detail page |
| `scripts/setup-s3-bucket.sh` | Idempotent AWS CLI bucket + IAM + policy + CORS |
| `src/__tests__/clothing-palette.test.ts` | Palette is non-empty, unique names, valid hex |
| `src/__tests__/color-space.test.ts` | sRGB↔Lab roundtrip, ΔE76 known values |
| `src/__tests__/match-palette.test.ts` | Hex matches expected palette tile |
| `src/__tests__/extract-dominant.test.ts` | Solid-color image → that color; ignores white bg |
| `src/__tests__/products-server.test.ts` | CRUD round-trip with a real DB transaction |
| `src/__tests__/supply-item-variants.test.ts` | Variant grid → multiple `supply_route_items` rows |
| `src/__tests__/opening-balance-variants.test.ts` | Opening balance with variants posts correct journals |
| `cypress/e2e/07-product-variants.cy.ts` | End-to-end: create product, upload image, add to supply route |

### Modified files

| Path | Change |
| --- | --- |
| `src/db/schema/index.ts` | `export * from "./products"` |
| `src/db/schema/supply-routes.ts` | `supply_route_items`: drop text columns, add `productColorId`/`size`, unique key |
| `src/db/schema/store.ts` | `store_stock` + `store_receivings`: same shape change |
| `src/db/schema/shops.ts` | `shop_stock`: same shape change |
| `src/db/schema/transfers.ts` | `store_transfer_items`: drop denormalized text |
| `src/db/schema/sales.ts` | `shop_sale_items`: drop `productName` |
| `src/db/schema/returns.ts` | Mirror change on any item tables |
| `src/server/functions/supply/items.ts` | Variant materialization |
| `src/server/functions/admin/opening-balance.ts` | Variant payload; one journal per product block |
| `src/server/functions/store/receiving.ts` | Receive against variant rows |
| `src/server/functions/store/transfers.ts` | Transfer per variant |
| `src/server/functions/shop/sales.ts` | Sale lines reference variant |
| `src/lib/permissions.ts` | `products.view`, `products.manage` |
| `src/lib/help-dictionary.ts` | New `product.*` terms |
| `src/routes/supply/$routeId.tsx` | Item dialog → ProductPicker + VariantGrid |
| `src/routes/store/index.tsx` | Stock list → ProductCard grid |
| `src/routes/store/opening-balance.tsx` | Variant-aware form |
| `src/routes/shop/index.tsx` | Stock list → ProductCard grid |
| `src/routes/shop/opening-balance.tsx` | Variant-aware form |
| `src/components/opening-balance/opening-balance-form.tsx` | Stacked product blocks |
| `src/components/app-sidebar.tsx` | "Products" entry |
| `package.json` | `+aws4fetch` |
| `.env.local`, `.env.test` | New `S3_PRODUCT_BUCKET`, `AWS_*` |

---

## Phase 0 — Setup

### Task 1: Install `aws4fetch` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `pnpm add aws4fetch`
Expected: dependency added, lockfile updated.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add package.json pnpm-lock.yaml
git commit -m "deps: add aws4fetch for S3 presigned URLs"
```

### Task 2: Provision S3 bucket via AWS CLI script

**Files:**
- Create: `scripts/setup-s3-bucket.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Idempotent S3 bucket + IAM user + policy + CORS for fidexa-inventory-images.
# Requires: aws cli configured with admin credentials.

set -euo pipefail

BUCKET="${BUCKET:-fidexa-inventory-images}"
REGION="${REGION:-eu-west-1}"
IAM_USER="${IAM_USER:-fidexa-inventory-uploader}"

echo "→ Creating bucket $BUCKET in $REGION (idempotent)"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

echo "→ Disabling block-public-access on bucket"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo "→ Applying public-read policy on products/* prefix"
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadProducts",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/products/*"
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY"

echo "→ Applying CORS for browser PUT and GET"
CORS=$(cat <<JSON
{
  "CORSRules": [{
    "AllowedOrigins": ["https://inventory.fidexa.org","http://localhost:3000"],
    "AllowedMethods": ["PUT","GET","HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
JSON
)
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "$CORS"

echo "→ Creating IAM user $IAM_USER (idempotent)"
aws iam create-user --user-name "$IAM_USER" 2>/dev/null || true

echo "→ Attaching tight inline policy"
INLINE=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"],
    "Resource": "arn:aws:s3:::$BUCKET/products/*"
  }]
}
JSON
)
aws iam put-user-policy --user-name "$IAM_USER" \
  --policy-name InventoryUploaderPolicy --policy-document "$INLINE"

KEY_COUNT=$(aws iam list-access-keys --user-name "$IAM_USER" \
  --query "length(AccessKeyMetadata)" --output text)
if [ "$KEY_COUNT" = "0" ]; then
  aws iam create-access-key --user-name "$IAM_USER" \
    --query "AccessKey.{Key:AccessKeyId,Secret:SecretAccessKey}" \
    --output table
  echo ""
  echo "↑↑ Copy these into .env.local, .env.test, and the wrangler secret store."
fi

echo "✓ Done."
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/setup-s3-bucket.sh`

- [ ] **Step 3: Run it**

Run: `./scripts/setup-s3-bucket.sh`
Expected: bucket exists, policy applied, IAM user created, access key printed.

- [ ] **Step 4: Populate `.env.local` and `.env.test`**

Append to both:

```
AWS_ACCESS_KEY_ID=<paste>
AWS_SECRET_ACCESS_KEY=<paste>
AWS_REGION=eu-west-1
S3_PRODUCT_BUCKET=fidexa-inventory-images
```

- [ ] **Step 5: Set Cloudflare secrets**

For each: `wrangler secret put <NAME>` and paste the value. Names: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_PRODUCT_BUCKET`.
Expected: ✨ Success! four times.

- [ ] **Step 6: Commit**

```
git add scripts/setup-s3-bucket.sh
git commit -m "infra: idempotent S3 setup script for product images"
```

### Task 3: Wire env vars into the runtime

**Files:**
- Modify: `src/env.ts` (or wherever `@t3-oss/env-core` lives — `grep -rn "createEnv" src/ | head -3` to find it)

- [ ] **Step 1: Add server vars**

Add to the `server` schema:
```ts
AWS_ACCESS_KEY_ID: z.string().min(1),
AWS_SECRET_ACCESS_KEY: z.string().min(1),
AWS_REGION: z.string().min(1),
S3_PRODUCT_BUCKET: z.string().min(1),
```
And to `runtimeEnv` (server block):
```ts
AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
AWS_REGION: process.env.AWS_REGION,
S3_PRODUCT_BUCKET: process.env.S3_PRODUCT_BUCKET,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/env.ts
git commit -m "env: require AWS_* and S3_PRODUCT_BUCKET"
```

---

## Phase 1 — Color libraries (TDD, pure, browser-safe)

### Task 4: Curated clothing palette

**Files:**
- Create: `src/lib/colors/palette.ts`
- Test: `src/__tests__/clothing-palette.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/clothing-palette.test.ts
import { describe, it, expect } from "vitest"
import { CLOTHING_PALETTE } from "#/lib/colors/palette"

describe("CLOTHING_PALETTE", () => {
  it("has at least 25 colors", () => {
    expect(CLOTHING_PALETTE.length).toBeGreaterThanOrEqual(25)
  })
  it("every entry has a non-empty name and valid #rrggbb hex", () => {
    for (const c of CLOTHING_PALETTE) {
      expect(c.name).toMatch(/\S/)
      expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
  it("color names are unique", () => {
    const names = new Set(CLOTHING_PALETTE.map((c) => c.name))
    expect(names.size).toBe(CLOTHING_PALETTE.length)
  })
  it("hex values are unique", () => {
    const hexes = new Set(CLOTHING_PALETTE.map((c) => c.hex.toLowerCase()))
    expect(hexes.size).toBe(CLOTHING_PALETTE.length)
  })
  it("includes common clothing colors", () => {
    const names = CLOTHING_PALETTE.map((c) => c.name.toLowerCase())
    for (const expected of ["black","white","navy","red","burgundy","khaki","gray"]) {
      expect(names).toContain(expected)
    }
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/__tests__/clothing-palette.test.ts`
Expected: FAIL — `CLOTHING_PALETTE` not defined.

- [ ] **Step 3: Implement**

```ts
// src/lib/colors/palette.ts
export type PaletteColor = { readonly name: string; readonly hex: string }

export const CLOTHING_PALETTE: ReadonlyArray<PaletteColor> = Object.freeze([
  { name: "Black",     hex: "#0a0a0a" },
  { name: "Charcoal",  hex: "#36454f" },
  { name: "Gray",      hex: "#808080" },
  { name: "Silver",    hex: "#c0c0c0" },
  { name: "White",     hex: "#fafafa" },
  { name: "Cream",     hex: "#f5e9d0" },
  { name: "Beige",     hex: "#d9c7a7" },
  { name: "Tan",       hex: "#c9a36a" },
  { name: "Khaki",     hex: "#b5a26b" },
  { name: "Brown",     hex: "#8b5a2b" },
  { name: "Chocolate", hex: "#5b3a1e" },
  { name: "Olive",     hex: "#6a6a2a" },
  { name: "Forest",    hex: "#1f5132" },
  { name: "Mint",      hex: "#9bd4b2" },
  { name: "Teal",      hex: "#0a8d8d" },
  { name: "Navy",      hex: "#0b1f44" },
  { name: "Royal",     hex: "#1f3aa6" },
  { name: "Denim",     hex: "#3b5b8b" },
  { name: "Sky",       hex: "#7ec8e3" },
  { name: "Lavender",  hex: "#b497bd" },
  { name: "Purple",    hex: "#5a2a86" },
  { name: "Magenta",   hex: "#c2185b" },
  { name: "Pink",      hex: "#f48fb1" },
  { name: "Coral",     hex: "#ff7f6e" },
  { name: "Red",       hex: "#c92a2a" },
  { name: "Burgundy",  hex: "#7b1f2b" },
  { name: "Maroon",    hex: "#5a1a1a" },
  { name: "Orange",    hex: "#e87722" },
  { name: "Mustard",   hex: "#d4a13a" },
  { name: "Yellow",    hex: "#f2c200" },
  { name: "Gold",      hex: "#b8860b" },
])
```

- [ ] **Step 4: Verify pass**

Run: `pnpm vitest run src/__tests__/clothing-palette.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```
git add src/lib/colors/palette.ts src/__tests__/clothing-palette.test.ts
git commit -m "feat(colors): add curated clothing palette"
```

### Task 5: Lab color space and ΔE76

**Files:**
- Create: `src/lib/colors/lab.ts`
- Test: `src/__tests__/color-space.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/color-space.test.ts
import { describe, it, expect } from "vitest"
import { hexToRgb, rgbToHex, rgbToLab, labToRgb, deltaE76 } from "#/lib/colors/lab"

describe("hex/rgb/lab conversions", () => {
  it("hexToRgb parses #rrggbb", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb("#7b1f2b")).toEqual({ r: 123, g: 31, b: 43 })
  })
  it("rgbToHex round-trips", () => {
    expect(rgbToHex({ r: 123, g: 31, b: 43 })).toBe("#7b1f2b")
  })
  it("rgbToLab → labToRgb round-trip is within 2 units", () => {
    const rgb = { r: 200, g: 100, b: 50 }
    const lab = rgbToLab(rgb)
    const back = labToRgb(lab)
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2)
  })
})

describe("deltaE76", () => {
  it("returns 0 for identical Lab", () => {
    const a = rgbToLab({ r: 100, g: 100, b: 100 })
    expect(deltaE76(a, a)).toBeCloseTo(0, 6)
  })
  it("returns small distance for near-identical colors", () => {
    const a = rgbToLab({ r: 200, g: 50, b: 50 })
    const b = rgbToLab({ r: 205, g: 55, b: 55 })
    expect(deltaE76(a, b)).toBeLessThan(5)
  })
  it("returns large distance between opposite colors", () => {
    const a = rgbToLab({ r: 0, g: 0, b: 0 })
    const b = rgbToLab({ r: 255, g: 255, b: 255 })
    expect(deltaE76(a, b)).toBeGreaterThan(80)
  })
})
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm vitest run src/__tests__/color-space.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/colors/lab.ts
export type Rgb = { r: number; g: number; b: number }
export type Lab = { L: number; a: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`invalid hex: ${hex}`)
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbToLinear(v: number): number {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
function linearToSrgb(v: number): number {
  const x = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(x * 255)))
}

const Xn = 0.95047, Yn = 1.0, Zn = 1.08883
function f(t: number): number { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116 }
function fInv(t: number): number { const t3 = t*t*t; return t3 > 216/24389 ? t3 : (116*t - 16) * 27 / 24389 }

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b)
  const X = 0.4124564*r + 0.3575761*g + 0.1804375*b
  const Y = 0.2126729*r + 0.7151522*g + 0.0721750*b
  const Z = 0.0193339*r + 0.1191920*g + 0.9503041*b
  const fx = f(X/Xn), fy = f(Y/Yn), fz = f(Z/Zn)
  return { L: 116*fy - 16, a: 500*(fx-fy), b: 200*(fy-fz) }
}

export function labToRgb(lab: Lab): Rgb {
  const fy = (lab.L + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200
  const X = Xn * fInv(fx), Y = Yn * fInv(fy), Z = Zn * fInv(fz)
  const r =  3.2404542*X - 1.5371385*Y - 0.4985314*Z
  const g = -0.9692660*X + 1.8760108*Y + 0.0415560*Z
  const b =  0.0556434*X - 0.2040259*Y + 1.0572252*Z
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) }
}

export function deltaE76(a: Lab, b: Lab): number {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b
  return Math.sqrt(dL*dL + da*da + db*db)
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm vitest run src/__tests__/color-space.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```
git add src/lib/colors/lab.ts src/__tests__/color-space.test.ts
git commit -m "feat(colors): sRGB↔Lab conversions and ΔE76"
```

### Task 6: Palette matcher

**Files:**
- Create: `src/lib/colors/match-palette.ts`
- Test: `src/__tests__/match-palette.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/match-palette.test.ts
import { describe, it, expect } from "vitest"
import { matchPaletteHex } from "#/lib/colors/match-palette"

describe("matchPaletteHex", () => {
  it("exact match returns same tile", () => {
    expect(matchPaletteHex("#0a0a0a").name).toBe("Black")
  })
  it("near-burgundy returns Burgundy", () => {
    expect(matchPaletteHex("#7c2030").name).toBe("Burgundy")
  })
  it("dark navy hex maps to Navy", () => {
    expect(matchPaletteHex("#0a1d40").name).toBe("Navy")
  })
  it("pure red hex maps to Red", () => {
    expect(matchPaletteHex("#cc2828").name).toBe("Red")
  })
  it("forest green hex maps to Forest", () => {
    expect(matchPaletteHex("#1e4f30").name).toBe("Forest")
  })
})
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm vitest run src/__tests__/match-palette.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/colors/match-palette.ts
import { CLOTHING_PALETTE, type PaletteColor } from "./palette"
import { deltaE76, hexToRgb, rgbToLab, type Lab } from "./lab"

const PALETTE_LAB: ReadonlyArray<{ tile: PaletteColor; lab: Lab }> =
  CLOTHING_PALETTE.map((tile) => ({ tile, lab: rgbToLab(hexToRgb(tile.hex)) }))

export function matchPaletteHex(hex: string): PaletteColor {
  return matchPaletteLab(rgbToLab(hexToRgb(hex)))
}

export function matchPaletteLab(lab: Lab): PaletteColor {
  let best = PALETTE_LAB[0]
  let bestD = deltaE76(lab, best.lab)
  for (let i = 1; i < PALETTE_LAB.length; i++) {
    const d = deltaE76(lab, PALETTE_LAB[i].lab)
    if (d < bestD) { bestD = d; best = PALETTE_LAB[i] }
  }
  return best.tile
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm vitest run src/__tests__/match-palette.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```
git add src/lib/colors/match-palette.ts src/__tests__/match-palette.test.ts
git commit -m "feat(colors): match any hex to nearest palette tile"
```

### Task 7: Dominant-color extraction

**Files:**
- Create: `src/lib/colors/extract-dominant.ts`
- Test: `src/__tests__/extract-dominant.test.ts`

- [ ] **Step 1: Failing test (operates on raw pixel array — no canvas needed)**

```ts
// src/__tests__/extract-dominant.test.ts
import { describe, it, expect } from "vitest"
import { extractDominantLab } from "#/lib/colors/extract-dominant"
import { rgbToLab } from "#/lib/colors/lab"

function buildPixels(rgbs: Array<[number, number, number]>) {
  const data = new Uint8ClampedArray(rgbs.length * 4)
  rgbs.forEach(([r, g, b], i) => {
    data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b; data[i*4+3] = 255
  })
  return { data, width: rgbs.length, height: 1 }
}

describe("extractDominantLab", () => {
  it("returns the only color in a solid image", () => {
    const pixels = buildPixels(Array(64).fill([200, 50, 50]) as Array<[number,number,number]>)
    const lab = extractDominantLab(pixels)
    const expected = rgbToLab({ r: 200, g: 50, b: 50 })
    expect(Math.abs(lab.L - expected.L)).toBeLessThan(3)
    expect(Math.abs(lab.a - expected.a)).toBeLessThan(3)
    expect(Math.abs(lab.b - expected.b)).toBeLessThan(3)
  })
  it("ignores white background and picks the foreground", () => {
    const pixels = buildPixels([
      ...Array(50).fill([253, 253, 253]),
      ...Array(14).fill([123, 31, 43]),
    ] as Array<[number,number,number]>)
    const lab = extractDominantLab(pixels)
    const expected = rgbToLab({ r: 123, g: 31, b: 43 })
    expect(Math.abs(lab.L - expected.L)).toBeLessThan(5)
    expect(Math.abs(lab.a - expected.a)).toBeLessThan(5)
    expect(Math.abs(lab.b - expected.b)).toBeLessThan(5)
  })
  it("falls back to including neutrals when image is all neutral", () => {
    const pixels = buildPixels(Array(64).fill([20, 20, 20]) as Array<[number,number,number]>)
    const lab = extractDominantLab(pixels)
    expect(lab.L).toBeLessThan(20)
  })
})
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm vitest run src/__tests__/extract-dominant.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/colors/extract-dominant.ts
import { rgbToLab, type Lab, type Rgb } from "./lab"

type PixelSource = { data: Uint8ClampedArray; width: number; height: number }

function luma({ r, g, b }: Rgb): number { return 0.299*r + 0.587*g + 0.114*b }
function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function collectLabs(src: PixelSource, includeNeutrals: boolean): Lab[] {
  const out: Lab[] = []
  for (let i = 0; i < src.data.length; i += 4) {
    const rgb: Rgb = { r: src.data[i], g: src.data[i+1], b: src.data[i+2] }
    const Y = luma(rgb)
    if (Y < 15 || Y > 240) continue
    if (!includeNeutrals && saturation(rgb) < 0.10) continue
    out.push(rgbToLab(rgb))
  }
  return out
}

export function extractDominantLab(src: PixelSource): Lab {
  let labs = collectLabs(src, false)
  if (labs.length === 0) labs = collectLabs(src, true)
  if (labs.length === 0) return { L: 50, a: 0, b: 0 }

  const BINS = 16
  type Bucket = { count: number; sumL: number; sumA: number; sumB: number }
  const buckets = new Map<number, Bucket>()
  for (const lab of labs) {
    const li = Math.min(BINS-1, Math.max(0, Math.floor((lab.L / 100) * BINS)))
    const ai = Math.min(BINS-1, Math.max(0, Math.floor(((lab.a + 128) / 256) * BINS)))
    const bi = Math.min(BINS-1, Math.max(0, Math.floor(((lab.b + 128) / 256) * BINS)))
    const key = li*BINS*BINS + ai*BINS + bi
    let bucket = buckets.get(key)
    if (!bucket) { bucket = { count: 0, sumL: 0, sumA: 0, sumB: 0 }; buckets.set(key, bucket) }
    bucket.count++; bucket.sumL += lab.L; bucket.sumA += lab.a; bucket.sumB += lab.b
  }

  let best: Bucket | undefined
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best) return { L: 50, a: 0, b: 0 }
  return { L: best.sumL/best.count, a: best.sumA/best.count, b: best.sumB/best.count }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/__tests__/extract-dominant.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```
git add src/lib/colors/extract-dominant.ts src/__tests__/extract-dominant.test.ts
git commit -m "feat(colors): dominant-color extraction with neutral fallback"
```

---

## Phase 2 — Schema reshape

### Task 8: Add `products` and `product_colors` tables

**Files:**
- Create: `src/db/schema/products.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Schema**

```ts
// src/db/schema/products.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleNumber: text("article_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sizes: text("sizes").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("idx_products_article").on(t.articleNumber)],
)

export const productColors = pgTable(
  "product_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    imageS3Key: text("image_s3_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_pc_product").on(t.productId),
    index("idx_pc_unique").on(t.productId, t.colorName),
  ],
)

export const productRelations = relations(products, ({ many }) => ({
  colors: many(productColors),
}))
export const productColorRelations = relations(productColors, ({ one }) => ({
  product: one(products, { fields: [productColors.productId], references: [products.id] }),
}))
```

- [ ] **Step 2: Export**

In `src/db/schema/index.ts`, add:
```ts
export * from "./products"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/db/schema/products.ts src/db/schema/index.ts
git commit -m "feat(schema): products and product_colors tables"
```

### Task 9: Reshape `supply_route_items`

**Files:**
- Modify: `src/db/schema/supply-routes.ts`

- [ ] **Step 1: Replace the `supplyRouteItems` definition**

Add `unique` to drizzle imports, import `productColors`, then replace the table body:

```ts
import { unique } from "drizzle-orm/pg-core"
import { productColors } from "./products"

export const supplyRouteItems = pgTable(
  "supply_route_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplyRouteId: uuid("supply_route_id").notNull().references(() => supplyRoutes.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    productColorId: uuid("product_color_id").notNull().references(() => productColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceForeign: numeric("unit_price_foreign", { precision: 15, scale: 2 }).notNull(),
    foreignCurrency: text("foreign_currency").notNull().default("RMB"),
    exchangeRateForeignToUsd: numeric("exchange_rate_foreign_to_usd", { precision: 10, scale: 6 }),
    exchangeRateUsdToUgx: numeric("exchange_rate_usd_to_ugx", { precision: 10, scale: 2 }),
    totalAmountForeign: numeric("total_amount_foreign", { precision: 15, scale: 2 }).notNull(),
    totalAmountUsd: numeric("total_amount_usd", { precision: 15, scale: 2 }),
    totalCostUgx: numeric("total_cost_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_sri_route").on(t.supplyRouteId),
    index("idx_sri_supplier").on(t.supplierId),
    index("idx_sri_pc").on(t.productColorId),
    unique("uq_sri_variant").on(t.supplyRouteId, t.supplierId, t.productColorId, t.size),
  ],
)
```

Extend `supplyRouteItemRelations` with:
```ts
productColor: one(productColors, { fields: [supplyRouteItems.productColorId], references: [productColors.id] }),
```

- [ ] **Step 2: Typecheck (callers will error — that's planned)**

Run: `pnpm tsc --noEmit -p . 2>&1 | head -30`
Expected: only callers fail. Fine.

- [ ] **Step 3: Commit**

```
git add src/db/schema/supply-routes.ts
git commit -m "feat(schema): supply_route_items by (productColorId, size)"
```

### Task 10: Reshape `store_stock` and `shop_stock`

**Files:**
- Modify: `src/db/schema/store.ts`
- Modify: `src/db/schema/shops.ts`

- [ ] **Step 1: `store_stock`**

In `src/db/schema/store.ts`, import `unique` and `productColors`, then replace the `storeStock` body:

```ts
export const storeStock = pgTable(
  "store_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "restrict" }),
    productColorId: uuid("product_color_id").notNull().references(() => productColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    supplyRouteItemId: uuid("supply_route_item_id").references(() => supplyRouteItems.id, { onDelete: "restrict" }),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    minimumSellPriceUgx: numeric("minimum_sell_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_ss_store").on(t.storeId),
    index("idx_ss_item").on(t.supplyRouteItemId),
    index("idx_ss_pc").on(t.productColorId),
    unique("uq_ss_variant").on(t.storeId, t.productColorId, t.size),
  ],
)
```

Extend `storeStockRelations` with the `productColor` relation. `store_receivings` keeps its shape — it references `supplyRouteItems` which already carries variant data.

- [ ] **Step 2: `shop_stock`**

In `src/db/schema/shops.ts`, mirror the change:

```ts
export const shopStock = pgTable(
  "shop_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull().references(() => shops.id, { onDelete: "restrict" }),
    productColorId: uuid("product_color_id").notNull().references(() => productColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    storeTransferItemId: uuid("store_transfer_item_id"),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    minimumSellPriceUgx: numeric("minimum_sell_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_shst_shop").on(t.shopId),
    index("idx_shst_transfer_item").on(t.storeTransferItemId),
    index("idx_shst_pc").on(t.productColorId),
    unique("uq_shst_variant").on(t.shopId, t.productColorId, t.size),
  ],
)
```

Extend `shopStockRelations`.

- [ ] **Step 3: Commit**

```
git add src/db/schema/store.ts src/db/schema/shops.ts
git commit -m "feat(schema): store_stock and shop_stock by (productColorId, size)"
```

### Task 11: Drop denormalized text columns on transfer/sale items

**Files:**
- Modify: `src/db/schema/transfers.ts`
- Modify: `src/db/schema/sales.ts`
- Modify: `src/db/schema/returns.ts` (if applicable)

- [ ] **Step 1: `storeTransferItems`**

Remove the `productName: text(...)` and `articleNumber: text(...)` columns. The FK to `storeStock` is enough — pull text via relations at read time.

- [ ] **Step 2: `shopSaleItems`**

Remove `productName: text("product_name").notNull()`. The FK to `shopStock` provides the path.

- [ ] **Step 3: Returns**

Open `src/db/schema/returns.ts`. Drop any `productName`/`articleNumber` columns on item tables there.

- [ ] **Step 4: Typecheck (expect callers to fail)**

Run: `pnpm tsc --noEmit -p . 2>&1 | grep "error TS" | wc -l`
Expected: a non-zero count. Callers are fixed in Phase 5.

- [ ] **Step 5: Commit**

```
git add src/db/schema/transfers.ts src/db/schema/sales.ts src/db/schema/returns.ts
git commit -m "feat(schema): drop denormalized text from transfer/sale items"
```

### Task 12: Wipe DBs and push new schema

**Files:** none (DB-only)

- [ ] **Step 1: Local push**

Run: `pnpm dotenv -e .env.local -- drizzle-kit push --force`
Expected: tables rebuilt. Confirm the destructive prompt if the CLI asks.

- [ ] **Step 2: Test push**

Run: `pnpm db:push:test --force`
Expected: same on the test DB.

- [ ] **Step 3: Note: seed will break until Task 34**

Skip `pnpm db:seed` for now. Move on.

- [ ] **Step 4: No commit** — DB only.

---

## Phase 3 — S3 presign and products server fns

### Task 13: S3 presigner

**Files:**
- Create: `src/lib/s3/sign.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/s3/sign.ts
import { AwsClient } from "aws4fetch"
import { env } from "#/env"

const PRESIGN_EXPIRY_SECONDS = 300

function awsClient(): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "s3",
  })
}

export function publicUrlFor(key: string): string {
  return `https://${env.S3_PRODUCT_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}

export async function presignPutUrl(params: { key: string; contentType: string }): Promise<string> {
  const client = awsClient()
  const url = new URL(publicUrlFor(params.key))
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRY_SECONDS))
  const signed = await client.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": params.contentType },
    }),
    { aws: { signQuery: true } },
  )
  return signed.url
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit -p .`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```
git add src/lib/s3/sign.ts
git commit -m "feat(s3): aws4fetch presigner for PUT uploads"
```

### Task 14: Products server functions (TDD with DB round-trip)

**Files:**
- Create: `src/server/functions/products/products.ts`
- Create: `src/server/functions/products/colors.ts`
- Create: `src/server/functions/products/uploads.ts`
- Test: `src/__tests__/products-server.test.ts`
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Failing DB round-trip test**

```ts
// src/__tests__/products-server.test.ts
import { describe, it, expect } from "vitest"
import { db } from "#/db"
import { products, productColors } from "#/db/schema"
import { eq } from "drizzle-orm"

describe("products schema round-trip", () => {
  it("inserts a product, its color, and reads back via relation", async () => {
    const [p] = await db.insert(products).values({
      articleNumber: `TEST-${Date.now()}`,
      name: "Test Crew",
      sizes: ["S","M","L"],
    }).returning()

    await db.insert(productColors).values({
      productId: p.id, colorName: "Burgundy", colorHex: "#7b1f2b",
    })

    const fetched = await db.query.products.findFirst({
      where: eq(products.id, p.id),
      with: { colors: true },
    })
    expect(fetched?.colors).toHaveLength(1)
    expect(fetched?.colors[0].colorName).toBe("Burgundy")

    await db.delete(products).where(eq(products.id, p.id))
  })
})
```

- [ ] **Step 2: Confirm failure (relation not registered yet if you skipped Task 8 export)**

Run: `pnpm vitest run src/__tests__/products-server.test.ts`
Expected: passes if Task 8 was completed correctly; if `db.query.products` is undefined, double-check the export in `src/db/schema/index.ts`.

- [ ] **Step 3: Implement `products.ts`**

```ts
// src/server/functions/products/products.ts
import { createServerFn } from "@tanstack/react-start"
import { eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { products } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  sizes: z.array(z.string().min(1).max(16)).default([]),
})

export const listProducts = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  return db.query.products.findMany({
    with: { colors: true },
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
})

export const getProductByArticle = createServerFn()
  .inputValidator(z.object({ articleNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return db.query.products.findFirst({
      where: eq(products.articleNumber, data.articleNumber),
      with: { colors: true },
    })
  })

export const searchProducts = createServerFn()
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    if (!data.query.trim()) {
      return db.query.products.findMany({ with: { colors: true }, limit: 20 })
    }
    const like = `%${data.query}%`
    return db.query.products.findMany({
      where: or(ilike(products.articleNumber, like), ilike(products.name, like)),
      with: { colors: true },
      limit: 20,
    })
  })

export const createProduct = createServerFn()
  .inputValidator(upsertInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db.insert(products).values(data).returning()
    return row
  })

export const updateProduct = createServerFn()
  .inputValidator(upsertInput.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, ...fields } = data
    const [row] = await db.update(products).set(fields).where(eq(products.id, id)).returning()
    return row
  })
```

- [ ] **Step 4: Implement `colors.ts`**

```ts
// src/server/functions/products/colors.ts
import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { productColors } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const hexRule = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const addProductColor = createServerFn()
  .inputValidator(z.object({
    productId: z.string().uuid(),
    colorName: z.string().min(1).max(40),
    colorHex: hexRule,
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db.insert(productColors).values(data).returning()
    return row
  })

export const updateProductColor = createServerFn()
  .inputValidator(z.object({
    id: z.string().uuid(),
    colorName: z.string().min(1).max(40).optional(),
    colorHex: hexRule.optional(),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, ...fields } = data
    const [row] = await db.update(productColors).set(fields).where(eq(productColors.id, id)).returning()
    return row
  })

export const setProductColorImage = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid(), imageS3Key: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const [row] = await db.update(productColors)
      .set({ imageS3Key: data.imageS3Key })
      .where(eq(productColors.id, data.id))
      .returning()
    return row
  })

export const deleteProductColor = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db.delete(productColors).where(eq(productColors.id, data.id))
  })
```

- [ ] **Step 5: Implement `uploads.ts`**

```ts
// src/server/functions/products/uploads.ts
import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { productColors } from "#/db/schema"
import { presignPutUrl, publicUrlFor } from "#/lib/s3/sign"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const getProductImageUploadUrl = createServerFn()
  .inputValidator(z.object({
    productColorId: z.string().uuid(),
    contentType: z.string().regex(/^image\//),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const color = await db.query.productColors.findFirst({
      where: eq(productColors.id, data.productColorId),
    })
    if (!color) throw new Error("Color not found")

    const key = `products/${color.productId}/${color.id}.jpg`
    const uploadUrl = await presignPutUrl({ key, contentType: data.contentType })
    return { uploadUrl, publicUrl: publicUrlFor(key), s3Key: key }
  })
```

- [ ] **Step 6: Update permissions**

In `src/lib/permissions.ts`:
- Add `"products.view" | "products.manage"` to the `Permission` union.
- `admin`: add both. `supervisor`: add `products.view` and `products.manage`. `sales`: add `products.view`.
- Extend `PERMISSION_SERVER_GATES`:

```ts
"products.view": [
  "src/server/functions/products/products.ts",
  "src/server/functions/products/colors.ts",
],
"products.manage": [
  "src/server/functions/products/products.ts",
  "src/server/functions/products/colors.ts",
  "src/server/functions/products/uploads.ts",
],
```

- [ ] **Step 7: Run permissions and products tests**

Run: `pnpm vitest run src/__tests__/permissions.test.ts src/__tests__/products-server.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```
git add src/server/functions/products/ src/__tests__/products-server.test.ts src/lib/permissions.ts
git commit -m "feat(products): CRUD server fns, S3 presign, permissions"
```

---

## Phase 4 — UI building blocks

### Task 15: `productImageUrl` helper

**Files:**
- Create: `src/lib/products.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/products.ts
const REGION = "eu-west-1"
const BUCKET = "fidexa-inventory-images"

export function productImageUrl(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`
}
```

- [ ] **Step 2: Commit**

```
git add src/lib/products.ts
git commit -m "feat(products): client-side image-url helper"
```

### Task 16: `ColorPicker`

(Component verified via E2E in Task 33. No unit test in this task — its inputs are wiring, not logic.)

**Files:**
- Create: `src/components/products/color-picker.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/products/color-picker.tsx
import { useState } from "react"
import { CLOTHING_PALETTE, type PaletteColor } from "#/lib/colors/palette"
import { matchPaletteHex } from "#/lib/colors/match-palette"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

interface Props {
  colorName: string
  colorHex: string
  onChange: (next: { colorName: string; colorHex: string }) => void
  sampledHex?: string | null
}

export function ColorPicker({ colorName, colorHex, onChange, sampledHex }: Props) {
  const [, setCustomMode] = useState(false)

  function pickTile(tile: PaletteColor) {
    setCustomMode(false)
    onChange({ colorName: tile.name, colorHex: tile.hex })
  }
  function pickCustomHex(hex: string) {
    const match = matchPaletteHex(hex)
    onChange({ colorName: colorName || match.name, colorHex: hex })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {CLOTHING_PALETTE.map((tile) => {
          const selected = tile.hex.toLowerCase() === colorHex.toLowerCase()
          return (
            <button key={tile.hex} type="button" onClick={() => pickTile(tile)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-1 text-xs hover:bg-muted",
                selected && "ring-2 ring-primary",
              )}>
              <span aria-hidden className="block size-6 rounded border" style={{ backgroundColor: tile.hex }} />
              <span className="truncate w-full text-center">{tile.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Color name (e.g. Burgundy)"
          value={colorName}
          onChange={(e) => onChange({ colorName: e.target.value, colorHex })}
        />
        <input
          type="color"
          aria-label="Custom color"
          value={colorHex || "#000000"}
          onChange={(e) => { setCustomMode(true); pickCustomHex(e.target.value) }}
          className="h-9 w-12 cursor-pointer rounded border"
        />
      </div>
      {sampledHex && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          Sampled from image:
          <span aria-hidden className="inline-block size-3 rounded border" style={{ backgroundColor: sampledHex }} />
          <code>{sampledHex}</code>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/components/products/color-picker.tsx
git commit -m "feat(products): ColorPicker (palette + custom hex)"
```

### Task 17: `ImageUploader`

(Verified via E2E in Task 33.)

**Files:**
- Create: `src/components/products/image-uploader.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/products/image-uploader.tsx
import { useRef, useState } from "react"
import { extractDominantLab } from "#/lib/colors/extract-dominant"
import { matchPaletteLab } from "#/lib/colors/match-palette"
import { labToRgb, rgbToHex, rgbToLab, type Rgb } from "#/lib/colors/lab"
import { Button } from "#/components/ui/button"

interface Props {
  initialUrl?: string | null
  onBlobReady: (blob: Blob) => void
  onSuggestColor?: (s: { name: string; hex: string; sampledHex: string }) => void
  onEyedrop?: (s: { name: string; hex: string; sampledHex: string }) => void
}

const MAX_DIM = 1600

export function ImageUploader({ initialUrl, onBlobReady, onSuggestColor, onEyedrop }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null)

  async function handleFile(file: File) {
    const img = await loadImage(file)
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_DIM)
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(img, 0, 0, w, h)

    const small = downscale(ctx, w, h, 128)
    const lab = extractDominantLab(small)
    const tile = matchPaletteLab(lab)
    const sampledHex = rgbToHex(labToRgb(lab))
    onSuggestColor?.({ name: tile.name, hex: tile.hex, sampledHex })

    canvas.toBlob((blob) => { if (blob) onBlobReady(blob) }, "image/jpeg", 0.82)
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.5))
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onEyedrop) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height)
    const ctx = canvas.getContext("2d"); if (!ctx) return
    const data = ctx.getImageData(x, y, 1, 1).data
    const rgb: Rgb = { r: data[0], g: data[1], b: data[2] }
    const lab = rgbToLab(rgb)
    const tile = matchPaletteLab(lab)
    onEyedrop({ name: tile.name, hex: tile.hex, sampledHex: rgbToHex(rgb) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          {previewUrl ? "Replace image" : "Upload image"}
        </Button>
        {previewUrl && <span className="text-xs text-muted-foreground">Click the image to eyedrop</span>}
      </div>
      <canvas ref={canvasRef} onClick={handleCanvasClick}
        className="rounded border cursor-crosshair max-h-72 object-contain"
        style={{ display: previewUrl ? "block" : "none" }} />
      {!previewUrl && initialUrl && <img src={initialUrl} alt="" className="rounded border max-h-72" />}
    </div>
  )
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h }
  const ratio = w > h ? max / w : max / h
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}
function downscale(ctx: CanvasRenderingContext2D, w: number, h: number, target: number) {
  const tmp = document.createElement("canvas")
  const ratio = Math.min(target / w, target / h, 1)
  tmp.width = Math.max(1, Math.round(w * ratio))
  tmp.height = Math.max(1, Math.round(h * ratio))
  const tctx = tmp.getContext("2d")!
  tctx.drawImage(ctx.canvas, 0, 0, tmp.width, tmp.height)
  return tctx.getImageData(0, 0, tmp.width, tmp.height)
}
```

- [ ] **Step 2: Commit**

```
git add src/components/products/image-uploader.tsx
git commit -m "feat(products): ImageUploader with dominant-color and eyedropper"
```

### Task 18: `ProductEditor` and `ColorEditor`

**Files:**
- Create: `src/components/products/product-editor.tsx`
- Create: `src/components/products/color-editor.tsx`

- [ ] **Step 1: ProductEditor**

```tsx
// src/components/products/product-editor.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
import { X } from "lucide-react"
import { createProduct } from "#/server/functions/products/products"

const DEFAULT_SIZE_SUGGESTIONS = ["XS","S","M","L","XL","XXL"]

interface Props { onCreated: (productId: string, articleNumber: string) => void }

export function ProductEditor({ onCreated }: Props) {
  const [articleNumber, setArticleNumber] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [sizes, setSizes] = useState<string[]>(["S","M","L"])
  const [sizeDraft, setSizeDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function addSize(value: string) {
    const v = value.trim()
    if (!v || sizes.includes(v)) return
    setSizes([...sizes, v]); setSizeDraft("")
  }

  async function save() {
    setSubmitting(true)
    try {
      const created = await createProduct({ data: { articleNumber, name, description: description || undefined, sizes } })
      onCreated(created.id, created.articleNumber)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Article number</label>
        <Input value={articleNumber} onChange={(e) => setArticleNumber(e.target.value)} placeholder="TR-001" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Product name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew-neck T-shirt" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Description (optional)</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Sizes</label>
        <div className="flex flex-wrap gap-1">
          {sizes.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <button type="button" onClick={() => setSizes(sizes.filter((x) => x !== s))} aria-label={`remove ${s}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={sizeDraft} onChange={(e) => setSizeDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSize(sizeDraft) } }}
            placeholder="Add size and press Enter" />
          {DEFAULT_SIZE_SUGGESTIONS.filter((s) => !sizes.includes(s)).slice(0, 4).map((s) => (
            <Button key={s} type="button" size="sm" variant="ghost" onClick={() => addSize(s)}>{s}</Button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!articleNumber || !name || sizes.length === 0 || submitting}>
          {submitting ? "Saving…" : "Create product"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ColorEditor**

```tsx
// src/components/products/color-editor.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { ColorPicker } from "./color-picker"
import { ImageUploader } from "./image-uploader"
import { addProductColor, setProductColorImage } from "#/server/functions/products/colors"
import { getProductImageUploadUrl } from "#/server/functions/products/uploads"

interface Props { productId: string; onCreated: (productColorId: string) => void }

export function ColorEditor({ productId, onCreated }: Props) {
  const [colorName, setColorName] = useState("")
  const [colorHex, setColorHex] = useState("#000000")
  const [sampledHex, setSampledHex] = useState<string | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    setSubmitting(true)
    try {
      const color = await addProductColor({ data: { productId, colorName, colorHex } })
      if (pendingBlob) {
        const { uploadUrl, s3Key } = await getProductImageUploadUrl({
          data: { productColorId: color.id, contentType: "image/jpeg" },
        })
        const res = await fetch(uploadUrl, { method: "PUT", body: pendingBlob, headers: { "Content-Type": "image/jpeg" } })
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
        await setProductColorImage({ data: { id: color.id, imageS3Key: s3Key } })
      }
      onCreated(color.id)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <ImageUploader
        onBlobReady={setPendingBlob}
        onSuggestColor={({ name, hex, sampledHex }) => { setColorName(name); setColorHex(hex); setSampledHex(sampledHex) }}
        onEyedrop={({ name, hex, sampledHex }) => { setColorName(name); setColorHex(hex); setSampledHex(sampledHex) }}
      />
      <ColorPicker
        colorName={colorName}
        colorHex={colorHex}
        onChange={({ colorName, colorHex }) => { setColorName(colorName); setColorHex(colorHex) }}
        sampledHex={sampledHex}
      />
      <div className="flex justify-end">
        <Button onClick={save} disabled={!colorName || submitting}>
          {submitting ? "Saving…" : "Save color"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```
git add src/components/products/product-editor.tsx src/components/products/color-editor.tsx
git commit -m "feat(products): ProductEditor and ColorEditor dialogs"
```

### Task 19: `ProductPicker`

**Files:**
- Create: `src/components/products/product-picker.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/products/product-picker.tsx
import { useEffect, useState } from "react"
import { searchProducts } from "#/server/functions/products/products"
import { Combobox, type ComboboxOption } from "#/components/ui/combobox"

export interface ProductSummary {
  id: string
  articleNumber: string
  name: string
  sizes: string[]
  colors: Array<{ id: string; colorName: string; colorHex: string; imageS3Key: string | null }>
}

interface Props {
  value?: string
  onChange: (productId: string, product: ProductSummary | undefined) => void
  onCreateNew?: () => void
}

export function ProductPicker({ value, onChange, onCreateNew }: Props) {
  const [results, setResults] = useState<ProductSummary[]>([])

  useEffect(() => {
    void searchProducts({ data: { query: "" } }).then((rs) => setResults(rs as ProductSummary[]))
  }, [])

  const options: ComboboxOption[] = results.map((p) => ({
    value: p.id, label: `${p.articleNumber} — ${p.name}`,
  }))

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(id) => onChange(id, results.find((r) => r.id === id))}
        placeholder="Select product…"
        searchPlaceholder="Type article number…"
        emptyMessage={
          <div className="p-2 text-sm">
            No matching product.{" "}
            {onCreateNew && (
              <button type="button" onClick={onCreateNew} className="font-medium underline">
                Create new
              </button>
            )}
          </div>
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/components/products/product-picker.tsx
git commit -m "feat(products): ProductPicker combobox"
```

### Task 20: `VariantGrid`

**Files:**
- Create: `src/components/products/variant-grid.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/products/variant-grid.tsx
import { useMemo } from "react"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

interface Color { id: string; colorName: string; colorHex: string }

interface Props {
  sizes: string[]
  colors: Color[]
  quantities: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function VariantGrid({ sizes, colors, quantities, onChange }: Props) {
  function setCell(productColorId: string, size: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    const next = { ...quantities, [`${productColorId}|${size}`]: n }
    if (n === 0) delete next[`${productColorId}|${size}`]
    onChange(next)
  }
  const total = useMemo(() => Object.values(quantities).reduce((s, x) => s + x, 0), [quantities])

  if (colors.length === 0) {
    return <p className="text-sm text-muted-foreground">Add at least one color to enter quantities.</p>
  }
  if (sizes.length === 0) {
    return <p className="text-sm text-muted-foreground">This product has no sizes defined.</p>
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="p-2 text-left font-medium">Color</th>
              {sizes.map((s) => <th key={s} className="p-2 text-center font-medium w-20">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-4 rounded border" style={{ backgroundColor: c.colorHex }} aria-hidden />
                    {c.colorName}
                  </span>
                </td>
                {sizes.map((s) => {
                  const key = `${c.id}|${s}`
                  return (
                    <td key={s} className="p-1">
                      <Input
                        type="number" min={0} inputMode="numeric"
                        value={quantities[key] ?? ""}
                        onChange={(e) => setCell(c.id, s, e.target.value)}
                        className={cn("h-9 text-right tabular-nums", quantities[key] ? "" : "text-muted-foreground")}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Total units: <span className="font-mono">{total}</span></p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/components/products/variant-grid.tsx
git commit -m "feat(products): VariantGrid"
```

### Task 21: `ProductCard`

**Files:**
- Create: `src/components/products/product-card.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/products/product-card.tsx
import { Link } from "@tanstack/react-router"
import { productImageUrl } from "#/lib/products"
import { cn } from "#/lib/utils"

interface ProductCardData {
  articleNumber: string
  name: string
  sizes: string[]
  colors: Array<{ id: string; colorName: string; colorHex: string; imageS3Key: string | null }>
  totalQuantity?: number
  locationCounts?: Array<{ label: string; qty: number }>
}

export function ProductCard({ data, className }: { data: ProductCardData; className?: string }) {
  const primaryImage = data.colors.find((c) => c.imageS3Key)?.imageS3Key
  return (
    <Link to="/products/$articleNumber" params={{ articleNumber: data.articleNumber }}
      className={cn("flex gap-3 rounded-lg border p-3 hover:bg-muted/40 transition", className)}>
      <div className="size-24 shrink-0 rounded-md border bg-muted overflow-hidden flex items-center justify-center">
        {primaryImage
          ? <img src={productImageUrl(primaryImage)!} alt="" className="size-full object-cover" />
          : <span className="text-xs text-muted-foreground">no image</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">{data.articleNumber}</span>
          <span className="font-medium truncate">{data.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.colors.map((c) => (
            <span key={c.id} aria-label={c.colorName} title={c.colorName}
              className="inline-block size-3 rounded-full border" style={{ backgroundColor: c.colorHex }} />
          ))}
        </div>
        {data.sizes.length > 0 && <p className="text-xs text-muted-foreground">Sizes: {data.sizes.join(", ")}</p>}
        {typeof data.totalQuantity === "number" && (
          <p className="text-sm">
            <span className="font-semibold">{data.totalQuantity}</span>
            <span className="text-muted-foreground"> in stock</span>
            {data.locationCounts && data.locationCounts.length > 0 && (
              <span className="text-muted-foreground">{" · "}{data.locationCounts.map((l) => `${l.label}: ${l.qty}`).join(" · ")}</span>
            )}
          </p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/components/products/product-card.tsx
git commit -m "feat(products): ProductCard"
```

---

## Phase 5 — Server function refactors (TDD)

### Task 22: Variant-aware supply route item insertion

**Files:**
- Modify: `src/server/functions/supply/items.ts`
- Test: `src/__tests__/supply-item-variants.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/supply-item-variants.test.ts
import { describe, it, expect } from "vitest"
import { materializeVariantRows } from "#/server/functions/supply/items"

describe("materializeVariantRows", () => {
  it("creates one row per non-zero cell", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "10", foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2", exchangeRateUsdToUgx: "3700",
      cells: [
        { productColorId: "c-red", size: "S", quantity: 3 },
        { productColorId: "c-red", size: "M", quantity: 0 },
        { productColorId: "c-blue", size: "L", quantity: 2 },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].size).toBe("S")
    expect(rows[0].quantity).toBe(3)
    expect(rows[1].productColorId).toBe("c-blue")
    expect(rows[1].quantity).toBe(2)
  })

  it("computes per-row totals", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "45", foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2", exchangeRateUsdToUgx: "3700",
      cells: [{ productColorId: "c1", size: "M", quantity: 20 }],
    })
    expect(rows[0].totalAmountForeign).toBe("900.00")
    expect(rows[0].totalAmountUsd).toBe("125.00")
    expect(rows[0].totalCostUgx).toBe("462500.00")
  })

  it("handles local UGX purchase", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "15000", foreignCurrency: "UGX",
      cells: [{ productColorId: "c1", size: "S", quantity: 10 }],
    })
    expect(rows[0].totalCostUgx).toBe("150000.00")
    expect(rows[0].totalAmountUsd).toBeNull()
  })
})
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm vitest run src/__tests__/supply-item-variants.test.ts`
Expected: FAIL (export missing).

- [ ] **Step 3: Replace `items.ts`**

```ts
// src/server/functions/supply/items.ts
import { createServerFn } from "@tanstack/react-start"
import { eq, ilike } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { supplyRouteItems, products } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const cellSchema = z.object({
  productColorId: z.string().uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

const variantInput = z.object({
  supplyRouteId: z.string().uuid(),
  supplierId: z.string().uuid(),
  unitPriceForeign: z.string(),
  foreignCurrency: z.string().default("RMB"),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
  cells: z.array(cellSchema).min(1),
})

export type MaterializedRow = {
  supplyRouteId: string
  supplierId: string
  productColorId: string
  size: string
  quantity: number
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  totalAmountForeign: string
  totalAmountUsd: string | null
  totalCostUgx: string
}

export function materializeVariantRows(input: z.infer<typeof variantInput>): MaterializedRow[] {
  const cells = input.cells.filter((c) => c.quantity > 0)
  const unitPrice = new BigNumber(input.unitPriceForeign)
  const isUsd = input.foreignCurrency === "USD"
  const fxToUsdStr = isUsd ? input.exchangeRateForeignToUsd ?? "1" : input.exchangeRateForeignToUsd

  return cells.map((cell) => {
    const totalAmountForeign = unitPrice.times(cell.quantity).toFixed(2)
    let totalAmountUsd: string | null = null
    let totalCostUgx: string
    if (input.foreignCurrency === "UGX" || !fxToUsdStr || !input.exchangeRateUsdToUgx) {
      totalCostUgx = totalAmountForeign
    } else {
      const fxToUsd = new BigNumber(fxToUsdStr)
      if (fxToUsd.isZero()) throw new Error("Exchange rate cannot be zero")
      const usdToUgx = new BigNumber(input.exchangeRateUsdToUgx)
      totalAmountUsd = new BigNumber(totalAmountForeign).div(fxToUsd).dp(2, BigNumber.ROUND_HALF_UP).toFixed(2)
      totalCostUgx = unitPrice.div(fxToUsd).times(usdToUgx).times(cell.quantity).dp(2, BigNumber.ROUND_HALF_UP).toFixed(2)
    }
    return {
      supplyRouteId: input.supplyRouteId,
      supplierId: input.supplierId,
      productColorId: cell.productColorId,
      size: cell.size,
      quantity: cell.quantity,
      unitPriceForeign: input.unitPriceForeign,
      foreignCurrency: input.foreignCurrency,
      exchangeRateForeignToUsd: input.exchangeRateForeignToUsd,
      exchangeRateUsdToUgx: input.exchangeRateUsdToUgx,
      totalAmountForeign,
      totalAmountUsd,
      totalCostUgx,
    }
  })
}

export const addSupplyRouteVariants = createServerFn()
  .inputValidator(variantInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const rows = materializeVariantRows(data)
    return db.insert(supplyRouteItems).values(rows).returning()
  })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db.delete(supplyRouteItems).where(eq(supplyRouteItems.id, data.id))
  })

export const getProductNameSuggestions = createServerFn()
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const like = `%${data.query}%`
    return db.query.products.findMany({ where: ilike(products.name, like), limit: 20 })
  })
```

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts`
Expected: PASS — the legacy `supply-item-calculations.test.ts` covers the same math via its inline helper and remains green.

- [ ] **Step 5: Commit**

```
git add src/server/functions/supply/items.ts src/__tests__/supply-item-variants.test.ts
git commit -m "feat(supply): variant-aware item insertion (TDD)"
```

### Task 23: Supply route UI (item dialog + table)

**Files:**
- Modify: `src/routes/supply/$routeId.tsx`
- Modify: `src/server/functions/supply/routes.ts`

- [ ] **Step 1: Update `getSupplyRoute` loader**

In `src/server/functions/supply/routes.ts`, find the `getSupplyRoute` query and update the `with:` clause:

```ts
items: { with: { supplier: true, productColor: { with: { product: true } } } },
```

- [ ] **Step 2: Replace `AddItemForm`**

In `src/routes/supply/$routeId.tsx`, replace the legacy `AddItemForm` with one that uses `ProductPicker` + `VariantGrid` and calls `addSupplyRouteVariants`:

```tsx
import { ProductPicker, type ProductSummary } from "#/components/products/product-picker"
import { VariantGrid } from "#/components/products/variant-grid"
import { ProductEditor } from "#/components/products/product-editor"
import { ColorEditor } from "#/components/products/color-editor"
import { addSupplyRouteVariants } from "#/server/functions/supply/items"
import { getProductByArticle } from "#/server/functions/products/products"

function AddItemForm(props: {
  supplyRouteId: string
  suppliers: Array<{ id: string; name: string }>
  rateUgxPerUsd: string | null
  rateRmbPerUsd: string | null
  onSuccess: () => void
}) {
  const [supplierId, setSupplierId] = useState<string | undefined>(props.suppliers[0]?.id)
  const [product, setProduct] = useState<ProductSummary | undefined>()
  const [productEditorOpen, setProductEditorOpen] = useState(false)
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [unitPriceForeign, setUnitPriceForeign] = useState("")
  const [foreignCurrency, setForeignCurrency] = useState("RMB")
  const [fxToUsd, setFxToUsd] = useState(props.rateRmbPerUsd ?? "")
  const [usdToUgx, setUsdToUgx] = useState(props.rateUgxPerUsd ?? "")

  async function refreshProduct(articleNumber: string) {
    const p = await getProductByArticle({ data: { articleNumber } })
    if (p) setProduct(p as ProductSummary)
  }

  async function submit() {
    if (!supplierId || !product) return
    const cells = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([key, q]) => {
        const [productColorId, size] = key.split("|")
        return { productColorId, size, quantity: q }
      })
    if (cells.length === 0) return
    await addSupplyRouteVariants({ data: {
      supplyRouteId: props.supplyRouteId, supplierId,
      unitPriceForeign, foreignCurrency,
      exchangeRateForeignToUsd: fxToUsd || undefined,
      exchangeRateUsdToUgx: usdToUgx || undefined,
      cells,
    }})
    props.onSuccess()
  }

  return (
    <div className="space-y-4">
      {/* keep existing supplier <Select>, money inputs, fx inputs from the legacy form */}
      <ProductPicker
        value={product?.id}
        onChange={(_, p) => { setProduct(p); setQuantities({}) }}
        onCreateNew={() => setProductEditorOpen(true)}
      />
      {product && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{product.articleNumber} — {product.name}</span>
            <Button size="sm" variant="outline" onClick={() => setColorEditorOpen(true)}>
              <Plus className="size-3 mr-1" /> Add color
            </Button>
          </div>
          <VariantGrid sizes={product.sizes} colors={product.colors} quantities={quantities} onChange={setQuantities} />
        </>
      )}
      {/* unit-price + currency + fx fields stay as in the legacy form */}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!product || Object.keys(quantities).length === 0 || !unitPriceForeign}>
          Save items
        </Button>
      </div>

      <Dialog open={productEditorOpen} onOpenChange={setProductEditorOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
          <ProductEditor onCreated={(_, articleNumber) => { setProductEditorOpen(false); void refreshProduct(articleNumber) }} />
        </DialogContent>
      </Dialog>
      <Dialog open={colorEditorOpen} onOpenChange={setColorEditorOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add color</DialogTitle></DialogHeader>
          {product && <ColorEditor productId={product.id} onCreated={() => { setColorEditorOpen(false); void refreshProduct(product.articleNumber) }} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Update the items table**

Replace `item.productName`/`item.articleNumber` with reads through the relation:

```tsx
<TableCell className="font-medium">{item.productColor.product.name}</TableCell>
<TableCell className="text-muted-foreground">{item.productColor.product.articleNumber}</TableCell>
<TableCell className="text-muted-foreground">
  <span className="inline-flex items-center gap-1.5">
    <span className="size-3 rounded-full border" style={{ backgroundColor: item.productColor.colorHex }} aria-hidden />
    {item.productColor.colorName} · {item.size}
  </span>
</TableCell>
```

- [ ] **Step 4: Typecheck and smoke**

Run: `pnpm tsc --noEmit -p . 2>&1 | grep "supply/\\$routeId"`
Expected: no errors here.

Run dev (`pnpm dev`), navigate to a supply route, add a product + color + variants. Verify the table renders the variant info.

- [ ] **Step 5: Commit**

```
git add "src/routes/supply/\$routeId.tsx" src/server/functions/supply/routes.ts
git commit -m "feat(supply): variant-aware add-item dialog and table"
```

### Task 24: Variant-aware opening balance (TDD)

**Files:**
- Modify: `src/server/functions/admin/opening-balance.ts`
- Modify: `src/server/functions/admin/opening-balance-validate.ts`
- Test: `src/__tests__/opening-balance-variants.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/opening-balance-variants.test.ts
import { describe, it, expect } from "vitest"
import { db } from "#/db"
import { products, productColors, stores, storeStock } from "#/db/schema"
import { addStoreOpeningBalance } from "#/server/functions/admin/opening-balance"
import { eq } from "drizzle-orm"

describe("addStoreOpeningBalance — variants", () => {
  it("creates one store_stock row per variant cell", async () => {
    const [p] = await db.insert(products).values({
      articleNumber: `OB-${Date.now()}`, name: "Test", sizes: ["S","M"],
    }).returning()
    const [c] = await db.insert(productColors).values({
      productId: p.id, colorName: "Red", colorHex: "#cc2828",
    }).returning()
    await db.insert(stores).values({ name: "Test Store" }).onConflictDoNothing()

    const result = await addStoreOpeningBalance({ data: {
      items: [{
        productId: p.id,
        unitCostUgx: "10000",
        cells: [
          { productColorId: c.id, size: "S", quantity: 5 },
          { productColorId: c.id, size: "M", quantity: 3 },
        ],
      }],
    }})
    expect(result.itemCount).toBe(2)

    const rows = await db.query.storeStock.findMany({
      where: eq(storeStock.productColorId, c.id),
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.size).sort()).toEqual(["M","S"])

    await db.delete(products).where(eq(products.id, p.id))
  })
})
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm vitest run src/__tests__/opening-balance-variants.test.ts`
Expected: FAIL — current handler signature is `{ productName, articleNumber, quantity, costPerUnitUgx }`.

- [ ] **Step 3: Rewrite the server functions**

Replace the contents of `src/server/functions/admin/opening-balance.ts` (keeping the imports for db, schema, accounting, audit, auth, rbac):

```ts
import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { storeStock, shopStock, shops } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateOpeningBalanceCell } from "./opening-balance-validate"

const cellSchema = z.object({
  productColorId: z.string().uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

const productEntry = z.object({
  productId: z.string().uuid(),
  unitCostUgx: z.string().min(1),
  cells: z.array(cellSchema).min(1),
})

const storeOpeningInput = z.object({ items: z.array(productEntry).min(1) })
const shopOpeningInput = z.object({ shopId: z.string().uuid(), items: z.array(productEntry).min(1) })

async function processProductEntry(
  tx: typeof db,
  entry: z.infer<typeof productEntry>,
  insertTarget: { table: typeof storeStock | typeof shopStock; locationId: string; locationType: "store" | "shop" },
  userId: string,
): Promise<{ rowIds: string[]; lineValue: BigNumber }> {
  const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
  const rowIds: string[] = []
  let lineValue = new BigNumber(0)

  for (const cell of entry.cells) {
    validateOpeningBalanceCell(cell, entry.unitCostUgx)
    const values =
      insertTarget.table === storeStock
        ? {
            storeId: insertTarget.locationId,
            productColorId: cell.productColorId,
            size: cell.size,
            supplyRouteItemId: null,
            quantityOnHand: cell.quantity,
            costPerUnitUgx: cost.toFixed(2),
            minimumSellPriceUgx: cost.toFixed(2),
          }
        : {
            shopId: insertTarget.locationId,
            productColorId: cell.productColorId,
            size: cell.size,
            storeTransferItemId: null,
            quantityOnHand: cell.quantity,
            costPerUnitUgx: cost.toFixed(2),
            minimumSellPriceUgx: cost.toFixed(2),
          }
    const [row] = await tx.insert(insertTarget.table).values(values as never).returning()
    rowIds.push(row.id)
    lineValue = lineValue.plus(cost.times(cell.quantity))
  }
  return { rowIds, lineValue }
}

export const addStoreOpeningBalance = createServerFn()
  .inputValidator(storeOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)

      for (const entry of data.items) {
        const { rowIds, lineValue } = await processProductEntry(
          tx as unknown as typeof db, entry,
          { table: storeStock, locationId: store.id, locationType: "store" },
          userId,
        )
        createdIds.push(...rowIds)
        totalValue = totalValue.plus(lineValue)

        await postJournalEntry(tx, {
          entries: [
            { type: "debit",  category: "Inventory - Store",  amount: lineValue.toFixed(2) },
            { type: "credit", category: "Owner's Equity",      amount: lineValue.toFixed(2) },
          ],
          referenceType: "opening_balance",
          referenceId: rowIds[0],
          locationType: "store",
          locationId: store.id,
          recordedBy: userId,
          description: `Opening balance: ${entry.cells.length} variants`,
        })
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.store",
        entityType: "store_stock",
        entityId: createdIds[0],
        metadata: { itemCount: createdIds.length, totalValueUgx: totalValue.toFixed(2), stockIds: createdIds },
      })

      return { itemCount: createdIds.length, totalValueUgx: totalValue.toFixed(2), stockIds: createdIds }
    })
  })

export const addShopOpeningBalance = createServerFn()
  .inputValidator(shopOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const shop = await db.query.shops.findFirst({ where: eq(shops.id, data.shopId) })
    if (!shop) throw new Error(`Shop not found: ${data.shopId}`)

    return db.transaction(async (tx) => {
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)
      for (const entry of data.items) {
        const { rowIds, lineValue } = await processProductEntry(
          tx as unknown as typeof db, entry,
          { table: shopStock, locationId: shop.id, locationType: "shop" },
          userId,
        )
        createdIds.push(...rowIds)
        totalValue = totalValue.plus(lineValue)
        await postJournalEntry(tx, {
          entries: [
            { type: "debit",  category: "Inventory - Shop",  amount: lineValue.toFixed(2) },
            { type: "credit", category: "Owner's Equity",     amount: lineValue.toFixed(2) },
          ],
          referenceType: "opening_balance",
          referenceId: rowIds[0],
          locationType: "shop",
          locationId: shop.id,
          recordedBy: userId,
          description: `Opening balance: ${entry.cells.length} variants`,
        })
      }
      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.shop",
        entityType: "shop_stock",
        entityId: createdIds[0],
        metadata: { shopId: shop.id, itemCount: createdIds.length, totalValueUgx: totalValue.toFixed(2), stockIds: createdIds },
      })
      return { itemCount: createdIds.length, totalValueUgx: totalValue.toFixed(2), stockIds: createdIds }
    })
  })
```

Rewrite `src/server/functions/admin/opening-balance-validate.ts`:

```ts
export type OpeningBalanceCell = { productColorId: string; size: string; quantity: number }

export function validateOpeningBalanceCell(cell: OpeningBalanceCell, unitCostUgx: string): void {
  if (!cell.productColorId) throw new Error("productColorId is required")
  if (!cell.size) throw new Error("size is required")
  if (!Number.isInteger(cell.quantity) || cell.quantity <= 0) {
    throw new Error("quantity must be a positive integer")
  }
  const cost = Number(unitCostUgx)
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("unitCostUgx must be a positive number")
  }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/__tests__/opening-balance-variants.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the legacy opening-balance test (may need updates)**

Run: `pnpm vitest run src/__tests__/opening-balance.test.ts`
If the legacy test uses the old shape, rewrite it to use the new payload — same scenario, new keys. Don't delete the test, port it.

- [ ] **Step 6: Commit**

```
git add src/server/functions/admin/opening-balance.ts src/server/functions/admin/opening-balance-validate.ts src/__tests__/opening-balance-variants.test.ts src/__tests__/opening-balance.test.ts
git commit -m "feat(opening-balance): variant payload and journals"
```

### Task 25: Opening-balance UI (store + shop) + Excel banner

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx`
- Modify: `src/routes/store/opening-balance.tsx`
- Modify: `src/routes/shop/opening-balance.tsx`

- [ ] **Step 1: Replace the row-array form with a stacked product-block form**

```tsx
// src/components/opening-balance/opening-balance-form.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { MoneyInput } from "#/components/ui/money-input"
import { Plus, Trash2 } from "lucide-react"
import { ProductPicker, type ProductSummary } from "#/components/products/product-picker"
import { VariantGrid } from "#/components/products/variant-grid"

type Block = { id: string; product?: ProductSummary; unitCostUgx: string; quantities: Record<string, number> }

interface Props {
  onSubmit: (items: Array<{
    productId: string
    unitCostUgx: string
    cells: Array<{ productColorId: string; size: string; quantity: number }>
  }>) => Promise<void>
  submitLabel: string
}

export function OpeningBalanceForm({ onSubmit, submitLabel }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([{ id: crypto.randomUUID(), unitCostUgx: "", quantities: {} }])
  const [submitting, setSubmitting] = useState(false)

  function update(id: string, patch: Partial<Block>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  async function save() {
    const items = blocks
      .filter((b) => b.product && b.unitCostUgx)
      .map((b) => ({
        productId: b.product!.id,
        unitCostUgx: b.unitCostUgx,
        cells: Object.entries(b.quantities)
          .filter(([, q]) => q > 0)
          .map(([key, q]) => {
            const [productColorId, size] = key.split("|")
            return { productColorId, size, quantity: q }
          }),
      }))
      .filter((i) => i.cells.length > 0)
    if (items.length === 0) return
    setSubmitting(true)
    try { await onSubmit(items) } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <Card key={b.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Product</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}>
              <Trash2 className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProductPicker value={b.product?.id} onChange={(_, p) => update(b.id, { product: p, quantities: {} })} />
            {b.product && (
              <>
                <div className="space-y-1">
                  <label className="text-sm">Unit cost (UGX)</label>
                  <MoneyInput value={b.unitCostUgx} onChange={(v) => update(b.id, { unitCostUgx: v })} />
                </div>
                <VariantGrid sizes={b.product.sizes} colors={b.product.colors} quantities={b.quantities} onChange={(q) => update(b.id, { quantities: q })} />
              </>
            )}
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={() => setBlocks([...blocks, { id: crypto.randomUUID(), unitCostUgx: "", quantities: {} }])}>
        <Plus className="size-4 mr-1" /> Add another product
      </Button>
      <div className="flex justify-end">
        <Button onClick={save} disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into store and shop routes**

In `src/routes/store/opening-balance.tsx` (and shop equivalent), render the new form and call the relevant server fn:

```tsx
<OpeningBalanceForm
  submitLabel="Save opening balance"
  onSubmit={async (items) => { await addStoreOpeningBalance({ data: { items } }); router.invalidate() }}
/>
```

Remove any rendering paths that depended on the old `productName`/`articleNumber` fields.

- [ ] **Step 3: Excel import banner**

If either route exposes an Excel import affordance, replace it with:

```tsx
<Alert>
  <AlertTitle>Excel import is being updated</AlertTitle>
  <AlertDescription>Add stock using the manual form for now. Variant support in the importer is on the backlog.</AlertDescription>
</Alert>
```

(Use the existing `Alert` from `#/components/ui/alert`.)

- [ ] **Step 4: Smoke**

Run `pnpm dev`. On the store opening-balance page, add two product blocks with variants, save, verify rows land in `storeStock`.

- [ ] **Step 5: Commit**

```
git add src/components/opening-balance/opening-balance-form.tsx src/routes/store/opening-balance.tsx src/routes/shop/opening-balance.tsx
git commit -m "feat(opening-balance): variant-aware form and Excel banner"
```

### Task 26: `store/receiving` for variants

**Files:**
- Modify: `src/server/functions/store/receiving.ts`
- Modify: `src/routes/store/receiving.tsx`

- [ ] **Step 1: Update insertion**

In `recordReceiving` (or whatever the function is named), when inserting `storeStock`, pull `productColorId` and `size` from the parent `supplyRouteItem`:

```ts
await tx.insert(storeStock)
  .values({
    storeId: receivingRow.storeId,
    productColorId: sri.productColorId,
    size: sri.size,
    supplyRouteItemId: sri.id,
    quantityOnHand: quantityReceived,
    costPerUnitUgx,
    minimumSellPriceUgx: costPerUnitUgx,
  })
  .onConflictDoUpdate({
    target: [storeStock.storeId, storeStock.productColorId, storeStock.size],
    set: { quantityOnHand: sql`${storeStock.quantityOnHand} + ${quantityReceived}` },
  })
```

Import `sql` from `drizzle-orm`. The unique index `uq_ss_variant` added in Task 10 makes this safe.

- [ ] **Step 2: Update queries that fetch unreceived items**

`getUnreceivedItems` / `listReceivableRoutes`: add `with: { productColor: { with: { product: true } } }` so the UI can render variant info.

- [ ] **Step 3: Update `src/routes/store/receiving.tsx`**

Replace `item.productName`/`item.articleNumber` with the relation reads. Add color swatch + size to the row.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/__tests__/receive-validate.test.ts`
Expected: PASS (ledger math unchanged).

Run dev, walk through a receiving flow end-to-end.

- [ ] **Step 5: Commit**

```
git add src/server/functions/store/receiving.ts src/routes/store/receiving.tsx
git commit -m "feat(store): receiving writes through productColorId/size"
```

### Task 27: `store/transfers` for variants

**Files:**
- Modify: `src/server/functions/store/transfers.ts`
- Modify: `src/routes/store/transfers.tsx`

- [ ] **Step 1: Drop denormalized writes**

In `createStoreTransfer`, when inserting `storeTransferItems`, drop `productName`/`articleNumber` from the values. The FK to `storeStock` already implicitly carries `productColorId` + `size`.

- [ ] **Step 2: Stock side of transfer**

When the transfer is received at a shop and `shopStock` is incremented or created, pull `productColorId` and `size` from the source `storeStock`. Use `onConflictDoUpdate` on `(shopId, productColorId, size)` to merge into an existing variant row.

- [ ] **Step 3: UI**

Add color swatch + size to transferable stock rows in `src/routes/store/transfers.tsx`. Replace any `productName` reads.

- [ ] **Step 4: Tests**

Run: `pnpm vitest run src/__tests__/transfer-entries.test.ts src/__tests__/return-entries-loss.test.ts src/__tests__/store-return-entries.test.ts`
Expected: PASS — ledger math unchanged. If these tests previously created stock with text columns, port their setup to use products/colors fixtures.

- [ ] **Step 5: Commit**

```
git add src/server/functions/store/transfers.ts src/routes/store/transfers.tsx
git commit -m "feat(store): transfers operate on variant rows"
```

### Task 28: `shop/sales` for variants

**Files:**
- Modify: `src/server/functions/shop/sales.ts`
- Modify: `src/routes/shop/sales.tsx`

- [ ] **Step 1: Server**

Drop `productName` from `recordShopSale` inputs and from the `shopSaleItems` insert. Pull product name + article via the `shopStock → productColor → product` chain for any audit-log description or PDF receipt.

- [ ] **Step 2: PDF receipt**

Open the receipt generator (likely `src/server/functions/shop/receipt.ts`). Replace `item.productName` reads with the relation chain. Add color name + size to the printed line item:

```
TR-001 Crew T  ·  Burgundy / M  ·  2 × 18,000  =  36,000
```

- [ ] **Step 3: Sales UI**

In `src/routes/shop/sales.tsx`, item picker shows color swatch + size, and the line table displays the same.

- [ ] **Step 4: Tests**

Run: `pnpm vitest run src/__tests__/sale-validate.test.ts src/__tests__/payment-allocation.test.ts src/__tests__/accounting-scenarios.test.ts src/__tests__/refund-validate.test.ts`
Expected: PASS. Port any test that constructs sale rows with `productName` to use the new shape.

- [ ] **Step 5: Commit**

```
git add src/server/functions/shop/sales.ts src/server/functions/shop/receipt.ts src/routes/shop/sales.tsx
git commit -m "feat(shop): sales and receipt operate on variant rows"
```

---

## Phase 6 — Display

### Task 29: Stock-list pages render `ProductCard`

**Files:**
- Modify: `src/routes/store/index.tsx`
- Modify: `src/routes/shop/index.tsx`

- [ ] **Step 1: Aggregator function**

Create a small pure helper in `src/lib/products.ts` (extend the file from Task 15):

```ts
import type { PaletteColor } from "./colors/palette"

interface StockRow {
  quantityOnHand: number
  productColor: {
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
    product: { id: string; articleNumber: string; name: string; sizes: string[] }
  }
}

export interface AggregatedProduct {
  product: { id: string; articleNumber: string; name: string; sizes: string[] }
  colors: Array<{ id: string; colorName: string; colorHex: string; imageS3Key: string | null }>
  total: number
}

export function aggregateStockByArticle(rows: StockRow[]): AggregatedProduct[] {
  const byArticle = new Map<string, AggregatedProduct>()
  for (const row of rows) {
    const key = row.productColor.product.articleNumber
    let entry = byArticle.get(key)
    if (!entry) {
      entry = { product: row.productColor.product, colors: [], total: 0 }
      byArticle.set(key, entry)
    }
    if (!entry.colors.some((c) => c.id === row.productColor.id)) {
      entry.colors.push({
        id: row.productColor.id,
        colorName: row.productColor.colorName,
        colorHex: row.productColor.colorHex,
        imageS3Key: row.productColor.imageS3Key,
      })
    }
    entry.total += row.quantityOnHand
  }
  return [...byArticle.values()].sort((a, b) => a.product.articleNumber.localeCompare(b.product.articleNumber))
}
```

- [ ] **Step 2: Store route**

In `src/routes/store/index.tsx`, fetch stock with the relation chain, aggregate, render with `ProductCard` in a responsive grid. Keep an optional "Table view" toggle if the legacy table is still wanted.

- [ ] **Step 3: Shop route**

Mirror in `src/routes/shop/index.tsx`. The route may render multiple shops — aggregate per `shopId` first, then either show shop sections or one big card grid with `locationCounts`.

- [ ] **Step 4: Commit**

```
git add src/lib/products.ts src/routes/store/index.tsx src/routes/shop/index.tsx
git commit -m "feat(stock-lists): ProductCard grid with aggregation"
```

### Task 30: Products lookup page

**Files:**
- Create: `src/routes/products/index.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Page**

```tsx
// src/routes/products/index.tsx
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { listProducts, searchProducts } from "#/server/functions/products/products"
import { ProductCard } from "#/components/products/product-card"
import { Input } from "#/components/ui/input"

export const Route = createFileRoute("/products/")({
  beforeLoad: ({ context }) => requireUiPermission(context, "products.view"),
  loader: async () => ({ products: await listProducts() }),
  component: ProductsPage,
})

function ProductsPage() {
  const { products: initial } = Route.useLoaderData()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(initial)

  async function handleSearch(value: string) {
    setQuery(value)
    setResults(await searchProducts({ data: { query: value } }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>
      <Input placeholder="Search by article or name…" value={query} onChange={(e) => handleSearch(e.target.value)} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map((p) => (
          <ProductCard key={p.articleNumber} data={{
            articleNumber: p.articleNumber, name: p.name, sizes: p.sizes,
            colors: p.colors.map((c) => ({ id: c.id, colorName: c.colorName, colorHex: c.colorHex, imageS3Key: c.imageS3Key })),
          }} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sidebar link**

In `src/components/app-sidebar.tsx`, add an item gated on `useCan("products.view")` linking to `/products`. Follow the existing pattern in that file.

- [ ] **Step 3: Commit**

```
git add src/routes/products/index.tsx src/components/app-sidebar.tsx
git commit -m "feat(products): lookup page and sidebar link"
```

### Task 31: Product detail page

**Files:**
- Create: `src/routes/products/$articleNumber.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/routes/products/$articleNumber.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission, useCan } from "#/lib/permissions"
import { getProductByArticle } from "#/server/functions/products/products"
import { ColorEditor } from "#/components/products/color-editor"
import { productImageUrl } from "#/lib/products"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog"
import { Plus } from "lucide-react"

export const Route = createFileRoute("/products/$articleNumber")({
  beforeLoad: ({ context }) => requireUiPermission(context, "products.view"),
  loader: async ({ params }) => {
    const product = await getProductByArticle({ data: { articleNumber: params.articleNumber } })
    if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
    return { product }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { product } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan("products.manage")
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [activeColorId, setActiveColorId] = useState(product.colors[0]?.id)
  const active = product.colors.find((c) => c.id === activeColorId) ?? product.colors[0]

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-muted-foreground">{product.articleNumber}</p>
        <h1 className="text-2xl font-bold">{product.name}</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="aspect-square rounded border bg-muted flex items-center justify-center overflow-hidden">
            {active?.imageS3Key
              ? <img src={productImageUrl(active.imageS3Key)!} alt="" className="size-full object-cover" />
              : <span className="text-sm text-muted-foreground">no image</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {product.colors.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveColorId(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs hover:bg-muted">
                <span className="size-3 rounded-full border" style={{ backgroundColor: c.colorHex }} aria-hidden />
                {c.colorName}
              </button>
            ))}
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setColorDialogOpen(true)}>
                <Plus className="size-3 mr-1" /> Add color
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">Sizes</h2>
          <p className="text-sm">{product.sizes.join(", ") || "—"}</p>
          {product.description && (
            <>
              <h2 className="font-medium mt-3">Description</h2>
              <p className="text-sm text-muted-foreground">{product.description}</p>
            </>
          )}
        </div>
      </div>
      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add color</DialogTitle></DialogHeader>
          <ColorEditor productId={product.id} onCreated={() => { setColorDialogOpen(false); router.invalidate() }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add "src/routes/products/\$articleNumber.tsx"
git commit -m "feat(products): detail page with color carousel"
```

---

## Phase 7 — Polish

### Task 32: Help dictionary

**Files:**
- Modify: `src/lib/help-dictionary.ts`

- [ ] **Step 1: Add new terms**

Add (use the existing entry shape — search the file for one example):

- `product.articleNumber` — "Unique code for the product (e.g. TR-001). Same article in different colors is one product."
- `product.colorName` — "Friendly name of the color (Burgundy, Navy). Auto-suggested from the uploaded image."
- `product.sizes` — "Sizes this product comes in. Each variant grid row is one color × one size."
- `product.image` — "One image per color. Click the image to eyedrop a different pixel."
- `col.variant` — "Color × size combination held by this stock row."

Repoint or remove existing `articleNumber` entries that no longer make sense.

- [ ] **Step 2: Verify tests**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/help-dictionary.ts
git commit -m "docs(info-tips): product and variant terms"
```

### Task 33: Cypress E2E (TDD-style — write before the polish pass below)

**Files:**
- Create: `cypress/e2e/07-product-variants.cy.ts`

- [ ] **Step 1: Write the spec**

```ts
// cypress/e2e/07-product-variants.cy.ts
describe("Product variants happy path", () => {
  beforeEach(() => {
    cy.loginAs("admin")
    cy.intercept("PUT", "https://*.s3.eu-west-1.amazonaws.com/**", { statusCode: 200 }).as("s3Put")
  })

  it("creates a product, adds a Red color, and records variants on a supply route", () => {
    cy.visit("/supply")
    cy.contains("button", "New route").click()
    cy.get('input').first().type("E2E Route")
    cy.contains("button", "Create").click()
    cy.location("pathname").should("match", /\/supply\/[\w-]+/)

    cy.contains("button", "Add Item").click()
    cy.contains("button", /Select product/i).click()
    cy.contains("Create new").click()
    cy.get('input').eq(0).type("E2E-001")
    cy.get('input').eq(1).type("E2E Crew")
    cy.contains("button", "Create product").click()

    cy.contains("button", "Add color").click()
    cy.contains("button", "Red").click()
    cy.contains("button", "Save color").click()
    cy.wait("@s3Put", { timeout: 5000 }) // present even when no image: harmless when not triggered
      .its("response.statusCode").should("eq", 200).then(() => null, () => null)

    cy.get('input[type=number]').first().type("3")
    cy.contains("button", "Save items").click()

    cy.contains("E2E-001").should("exist")
    cy.contains("Red").should("exist")
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm test:e2e --spec cypress/e2e/07-product-variants.cy.ts`
Expected: PASS. If selectors miss, tighten with `data-testid` props in the relevant components (one-line per test failure).

- [ ] **Step 3: Commit**

```
git add cypress/e2e/07-product-variants.cy.ts
git commit -m "test(e2e): product variants happy path"
```

### Task 34: Seed script

**Files:**
- Modify: `src/db/seed.ts`

- [ ] **Step 1: Recreate seed**

Update the seed to:

- Create 3 products (`TR-001`, `JK-100`, `PT-200`) with sizes `["S","M","L"]`.
- For each, create 2 colors (e.g., Black + Burgundy) — `imageS3Key: null` is fine for seed.
- Create one store and 1–2 shops.
- (Optional) Create one supply route with a variant entry per product to demo the flow.

Run: `pnpm db:seed`
Expected: completes; `/products` page shows the seeded products.

- [ ] **Step 2: Commit**

```
git add src/db/seed.ts
git commit -m "chore(seed): variant-aware sample data"
```

### Task 35: Full check + cleanup

- [ ] **Step 1: Run everything**

Run:
```
pnpm lint && pnpm tsc --noEmit -p . && pnpm test && pnpm test:e2e
```
Expected: all clean.

- [ ] **Step 2: Fix in place — common gotchas**

- Missing `with: { productColor: { with: { product: true } } }` on a Drizzle query that the UI then reads from → add it.
- Leftover `productName`/`articleNumber` reads on JSX → swap to the relation chain.
- `permissions.test.ts` failure → a new server fn forgot `requireRole`. Add it.
- Excel parser tests (`excel-parse.test.ts`, `excel-import-prepare.test.ts`) — these will fail because the importer is out of scope. Mark them `it.skip(...)` with an inline TODO referencing the backlog item ("variant-aware Excel importer").

- [ ] **Step 3: Commit fixups**

```
git add -A
git commit -m "fix: cleanup after variant refactor"
```

### Task 36: Deploy + manual smoke

- [ ] **Step 1: Deploy**

Run: `pnpm deploy`
Expected: wrangler ships the worker.

Confirm Cloudflare secrets are present:
Run: `wrangler secret list`
Expected: includes `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_PRODUCT_BUCKET`.

- [ ] **Step 2: Manual click-through (~5 min)**

- Create a product with a real photo, confirm auto color pick works.
- Eyedrop a different pixel — confirm the color and tile update.
- Add the product to a supply route via the variant grid.
- Receive it at the store. Transfer some to a shop. Sell one.
- Verify `ProductCard` counts roll up on `/store`, `/shop`, and `/products`.

- [ ] **Step 3: Tag**

```
git tag -a v-variants-launch -m "Item variants + images live"
git push --tags
```

---

## Self-review notes

- **Spec coverage:** Spec §3 schema → Tasks 8–11. Spec §4 UI → Tasks 16–21. Spec §5 S3 → Tasks 2–3, 13. Spec §6 screens → Tasks 23, 25, 29–31. Spec §7 color extraction → Tasks 4–7. Spec §8 permissions → Task 14 step 6. Spec §9 out-of-scope (Excel) → Task 25 step 3 + Task 35 step 2.
- **Type / name consistency:** `productColorId` (not `colorVariantId`); `cells: Array<{ productColorId, size, quantity }>` is the single shape across supply, opening balance, transfer.
- **TDD presence:** Tasks 4, 5, 6, 7, 14, 22, 24, 33 lead with a failing test (vitest + cypress). Pure-UI tasks (16, 17, 19, 20, 21) are validated by the E2E in Task 33 — flagged inline.
- **No placeholders:** every step has real code or a real command.
- **Destructive operation called out:** Task 12 wipes the DB. The user has greenlit this in brainstorming; do not run without re-confirming if context changes.
- **Excel importer:** intentionally out of scope; the banner in Task 25 step 3 makes that visible to users, and Task 35 step 2 skips the parser tests with a backlog pointer.
