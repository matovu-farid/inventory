# Item Variants and Images — Design Spec

**Date:** 2026-05-11
**Status:** Draft — awaiting review
**Owner:** matovu-farid

## 1. Goal

Turn inventory items from a flat `(productName, articleNumber, quantity)` tuple
into a richer product model with **per-color images, per-variant quantities,
and a curated/visual color picker**. Display stock Amazon-style — a thumbnail,
the article, available colors, sizes, and counts per location.

The model applies wherever items are recorded today: supply-route entry, store
opening balance, shop opening balance — and to every downstream screen that
displays stock.

## 2. Decisions captured

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Where metadata lives | Hybrid: catalog (`products`, `product_colors`) + variant on each stock row |
| D2 | Variant model | One product (articleNumber) → many color variants (one image per color) → each variant × size = a stock unit |
| D3 | Supply entry UX | One product line + a `size × color` quantity grid below it |
| D4 | Color picker | Curated ~30-tile clothing palette + free hex + image eyedropper |
| D5 | Color from image | Auto-extract dominant color on upload; user can eyedrop or override |
| D6 | Image storage | S3 `eu-west-1`, public-read, one image per color variant |
| D7 | Upload flow | Presigned PUT direct from browser to S3; client-side downscale before upload |
| D8 | Existing data | Wiped pre-launch — no migration code |
| D9 | Scope | Six screens (see §6) |

## 3. Data model

### New tables — `src/db/schema/products.ts`

```ts
products = {
  id: uuid pk,
  articleNumber: text not null unique,   // canonical key, e.g. "TR-001"
  name: text not null,                   // human label, e.g. "Crew-neck T-shirt"
  description: text nullable,
  sizes: text[] not null default [],     // ["S","M","L"] — sizes this product comes in
  createdAt, updatedAt,
}

productColors = {
  id: uuid pk,
  productId: uuid not null fk products on delete cascade,
  colorName: text not null,              // "Burgundy"
  colorHex: text not null,               // "#7B1F2B"
  imageS3Key: text nullable,             // "products/{productId}/{colorId}.jpg"
  createdAt, updatedAt,
  unique(productId, colorName),
}
```

Indexes: `products.articleNumber` (unique implies index); `product_colors.productId`.

### Reshape existing tables (clean rebuild, no ALTERs)

```
supply_route_items
  drop:  productName, articleNumber
  add:   productColorId uuid fk product_colors not null
         size text not null
  keep:  quantity, unitPriceForeign, foreignCurrency, fx fields, totals
  unique(supplyRouteId, supplierId, productColorId, size)

store_stock
  drop:  productName, articleNumber
  add:   productColorId uuid fk product_colors not null
         size text not null
  keep:  quantityOnHand, costPerUnitUgx, minimumSellPriceUgx, supplyRouteItemId
  unique(storeId, productColorId, size)

shop_stock
  same pattern as store_stock, scoped by shopId
```

Downstream tables that reference items by text (`store_transfer_items`,
`store_receivings`, `shop_sale_items`, return tables, opening-balance import rows)
follow the same swap: drop the two text columns, add `productColorId + size`.

The text `productName` / `articleNumber` are gone from stock rows entirely.
All display reads through the catalog — renames propagate automatically.

### Why this shape

- **`articleNumber` is the product key**, not `(name, articleNumber)`. Two
  products with the same article number are not allowed; the catalog enforces it.
- **Color owns the image** because in clothing the visual identity *is* the
  color. Same `TR-001` in Red and Blue are two photos.
- **Size is a free string on the stock row**, not a separate variant id. Sizes
  are listed on the product (informational and used to populate the variant
  grid), but the row stores the chosen size as text. Avoids a third table and
  keeps the unique key compact.
- **Quantity is never on the catalog.** Rolls up from stock at query time.

## 4. UI components

### 4.1 ProductPicker (`src/components/products/product-picker.tsx`)

Combobox keyed by article number. Search shows article + name + a small color
swatch row. Selecting an article populates `productId`; the downstream variant
grid then materializes its colors and sizes.

- "Create new product" affordance opens **ProductEditor** dialog.
- "Add color to existing product" affordance opens **ColorEditor** dialog.

### 4.2 ProductEditor (`src/components/products/product-editor.tsx`)

Dialog form: `articleNumber`, `name`, `description`, `sizes` (chip input —
type "S" then Enter; default chips for common clothing sizes XS/S/M/L/XL/XXL).
On save, returns the new `productId` and routes to ColorEditor for the first
color.

### 4.3 ColorEditor (`src/components/products/color-editor.tsx`)

Dialog form: `colorName`, `colorHex`, image upload. Wraps **ColorPicker** and
**ImageUploader**. Saving uploads the image to S3 (via presigned PUT, see §5)
and writes `product_colors` row.

### 4.4 ColorPicker (`src/components/products/color-picker.tsx`)

Three input modes side by side:

1. **Curated palette** — grid of ~30 tiles (Black, White, Cream, Beige, Tan,
   Brown, Chocolate, Khaki, Olive, Forest, Mint, Teal, Navy, Royal, Sky, Denim,
   Lavender, Purple, Magenta, Pink, Coral, Red, Burgundy, Maroon, Orange,
   Mustard, Yellow, Gold, Silver, Gray, Charcoal). Tile shows swatch + label.
   Tap → sets `colorName` + `colorHex`.
2. **Eyedropper** — when an image is uploaded, clicking anywhere on the image
   samples that pixel. The matched palette tile gets pre-selected.
3. **Custom** — free `colorName` text input + native `<input type="color">`
   for hex.

The palette lives in `src/lib/colors/clothing-palette.ts` as a frozen array of
`{ name, hex }`. The matcher uses ΔE in Lab space — see §7.

### 4.5 ImageUploader (`src/components/products/image-uploader.tsx`)

- File input → preview canvas → on file selected:
  1. Downscale to max 1600px on the longest side (`canvas.drawImage`).
  2. Re-encode as JPEG at quality 0.82.
  3. Run dominant-color extraction (§7) → emit `suggestedColor` event upward
     so ColorPicker can pre-select.
- On form submit (parent), request a presigned PUT URL from
  `getProductImageUploadUrl()` (see §5), then `PUT` the blob.

### 4.6 VariantGrid (`src/components/products/variant-grid.tsx`)

For supply-route item entry. Once a product is picked:

```
              S    M    L
   Red      [ 10][ 12][ 8]
   Blue     [  0][  5][ 0]
   [+ add color]
```

Cells are quantity inputs. Empty / zero cells are skipped — only non-zero cells
materialize a `supply_route_items` row. Pricing fields (unit price, fx) live
above the grid and apply to the whole product line; the server splays them
across the materialized rows (each row's `quantity` × shared `unitPriceForeign`
drives its own totals).

For store/shop opening balance, the same grid is used but with `quantityOnHand`,
`costPerUnitUgx`, `minimumSellPriceUgx` inputs. Cost + min-sell are entered
once per product and applied to every materialized row, with per-cell override
possible (collapsed by default).

### 4.7 ProductCard (`src/components/products/product-card.tsx`)

Amazon-style read-only card. Used in stock lists.

```
┌────────────┐  TR-001  Crew-neck T-shirt
│ [image]    │  ● Red ● Blue ● Navy
│ 120×120    │  Sizes: S, M, L
└────────────┘  In stock: 47 (Store) · 23 (Shop A) · 18 (Shop B)
```

Color chips are clickable filters (filter the list to that color). Click the
card → navigate to `/products/$articleNumber`.

### 4.8 ProductDetail (`src/routes/products/$articleNumber.tsx`)

Larger view: image carousel across colors, full variant grid showing quantity
per location, edit affordances (admin/supervisor only).

## 5. S3 + image pipeline

### Bucket

- Name: `fidexa-inventory-images`
- Region: `eu-west-1`
- Public-read policy on `products/*` prefix
- CORS: allow `PUT, GET` from the production domain `inventory.fidexa.org`
  and from `http://localhost:3000` (dev)
- Lifecycle: none (clothing images are long-lived)
- Versioning: off (overwrite is acceptable; uploads use deterministic keys)

Bucket + IAM user + access keys provisioned via AWS CLI in a one-off setup
script committed to `scripts/setup-s3-bucket.sh` (idempotent — checks before
create).

### Credentials

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=eu-west-1`,
  `S3_PRODUCT_BUCKET=fidexa-inventory-images` — added to `.env.local`,
  `.env.test`, and `wrangler secret put` for production.
- The IAM user has a tight policy: `s3:PutObject`, `s3:GetObject`,
  `s3:DeleteObject` on `arn:aws:s3:::fidexa-inventory-images/products/*` only.

### Presign

Server function `getProductImageUploadUrl({ productColorId, contentType })`:

- RBAC: admin or supervisor
- Validates content type starts with `image/`
- Builds key: `products/{productId}/{colorId}.jpg`
- Signs a 5-minute PUT URL using `aws4fetch` (Cloudflare-Worker-friendly,
  no Node deps).
- Returns `{ uploadUrl, publicUrl }`.

Client uploads with `fetch(uploadUrl, { method: 'PUT', body: blob })`. On
success, calls `setProductColorImage({ productColorId, s3Key })` to persist
the key.

### Read

`publicUrl` is `https://fidexa-inventory-images.s3.eu-west-1.amazonaws.com/{key}`.
Stored as `imageS3Key` on `product_colors`; a small helper
`productImageUrl(s3Key)` builds the URL for display.

## 6. Screens touched

| Screen | File | Change |
| --- | --- | --- |
| Supply route detail | `src/routes/supply/$routeId.tsx` | Item dialog → ProductPicker + VariantGrid |
| Store opening balance | `src/routes/store/opening-balance.tsx` | Per-row → ProductPicker + VariantGrid |
| Shop opening balance | `src/routes/shop/opening-balance.tsx` | Same as store |
| Store stock list | `src/routes/store/index.tsx` | Display as ProductCard grid (with table toggle for power users) |
| Shop stock list | `src/routes/shop/index.tsx` | Same as store |
| Product lookup (new) | `src/routes/products/index.tsx` + `src/routes/products/$articleNumber.tsx` | Search + detail page |

Downstream functions that must be updated to operate on `(productColorId, size)`:

- `src/server/functions/supply/items.ts` — add/update/delete now take variant
  bundles, materialize multiple rows per product entry
- `src/server/functions/store/receiving.ts` — receive against variant rows
- `src/server/functions/store/transfers.ts` — transfer per variant
- `src/server/functions/shop/sales.ts` — sale lines specify variant
- `src/server/functions/admin/opening-balance.ts` — accept variant payload
- `src/server/functions/admin/import-prepare.ts` and Excel parser — out of scope
  for v1 (Excel import gets a banner "use the manual flow until import is
  updated"); add an `import-prepare` follow-up to the backlog

The `articleNumber` `InfoTip` term in `help-dictionary.ts` is repointed at the
new product concept; new terms added: `product.colorName`, `product.sizes`,
`product.image`.

## 7. Color extraction algorithm

Pure browser code, ~120 lines, no library.

```
extractDominantColor(imageDataUrl):
  load → off-screen canvas at 128×128
  pixels = getImageData(...)
  candidates = []
  for each pixel:
    rgb = (r, g, b)
    luma = 0.299r + 0.587g + 0.114b
    if luma < 15 or luma > 240: skip            // background / shadow
    sat = (max(rgb) - min(rgb)) / max(rgb)
    if sat < 0.10: skip                          // washed-out, likely background
    candidates.push(rgbToLab(rgb))

  // If everything was filtered (a neutral-fabric image), redo the pass
  // without the saturation filter so blacks/whites/grays can be picked.
  if candidates.empty: re-run loop with sat filter disabled

  // bucket into 16 bins per Lab axis, pick the densest bucket's centroid
  centroid = densestBucketCentroid(candidates)

  // match to curated palette
  best = palette.reduce(min by deltaE76(centroid, lab(p.hex)))
  return { name: best.name, hex: best.hex, sampledHex: rgbToHex(labToRgb(centroid)) }
```

`deltaE76` is good enough — it's a clothing app, not a print shop.

Eyedropper bypasses the bucketing: it just reads one pixel's rgb, converts to
Lab, finds nearest palette tile, and returns the same shape.

Unit-tested with fixture images committed under `src/__tests__/fixtures/`:
solid-red, red-with-white-background, multi-color logo, near-black-fabric.

## 8. Permissions

Reuses existing roles:

- **Admin / supervisor:** create/edit products, colors, sizes, images;
  add supply-route items; opening balance.
- **Sales:** read products and stock; record sales with variant pick.
- The presign endpoint requires admin or supervisor (matches creating a product).

Permission table additions in `src/lib/permissions.ts`:
`products.view`, `products.manage`. Existing `procurement.manage`,
`store.manage`, `shop.manage` permissions continue to gate their respective
flows.

## 9. Out of scope (v1)

- Excel import of variant data (manual flow only until v2).
- Multi-image gallery per color (one image per color in v1).
- Bulk image upload (one product at a time).
- Image cropping / focal-point UI (uploaded image is used as-is, downscaled).
- Variant-level pricing differences (one unit price per supply-route product
  entry; can override in future).
- CDN in front of S3 (public S3 + browser cache is enough for the traffic
  scale; revisit if image bandwidth becomes a cost issue).

## 10. Risks and open questions

- **Worker bundle size** with `aws4fetch` — ~6KB minified, fine.
- **Image hot-linking** — bucket is public; anyone with the URL can hotlink.
  Acceptable; images aren't sensitive. Mitigation if needed later: serve through
  a Workers route with a Referer check, or move to R2 + signed URLs.
- **Color extraction on photos of mixed-color garments** (e.g., striped shirt)
  may give a surprising auto-pick. The eyedropper + palette tiles always
  override, and we show the sampled hex chip next to the matched name so the
  user sees what was extracted before committing.
- **Stock unique constraints during transfers** — adding a partial transfer of
  size `M` to a shop that already has size `M` of the same variant must `INSERT
  … ON CONFLICT … DO UPDATE` (sum quantities). Same pattern the receiving
  function already uses; just extend it to the new key.

## 11. Implementation slicing (preview)

Detailed plan comes from `writing-plans` next. Likely order:

1. S3 bucket + IAM + env vars + presign server function
2. Schema migration (drop old columns, add new tables and FKs)
3. ColorPicker + ImageUploader + clothing palette + color extraction (with tests)
4. ProductEditor / ColorEditor dialogs
5. ProductPicker + VariantGrid
6. Refactor supply-route item add/edit (server + UI)
7. Refactor opening-balance forms (store + shop)
8. Refactor downstream functions (receiving, transfers, sales)
9. ProductCard + stock-list display refactor (store + shop)
10. Product lookup page (`/products` + `/products/$articleNumber`)
11. Permissions, info-tips, e2e tests
