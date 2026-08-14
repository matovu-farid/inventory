# Multi-image color capture and QR handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-image color capture, persistent color-image galleries, staged multi-photo QR handoff, and session-scoped QR access without a second login.

**Architecture:** Keep color suggestions client-side and deterministic. Persist durable images in `item_color_images`; use `picture_uploads` as a QR staging ledger so Add color can start a session before its new color exists. QR tokens target an item and optionally an existing color, and authenticated desktop code attaches staged rows after the user saves or finishes.

**Tech Stack:** TanStack Start/Router, React 19, TypeScript, Drizzle/PostgreSQL, S3 presigned PUTs, Vitest/Testing Library, Cypress.

---

## File map

- Create `src/db/schema/item-color-images.ts`: durable image attachments and Drizzle relations.
- Create `src/db/schema/picture-uploads.ts`: QR session staging rows and relations.
- Modify `src/db/schema/picture-upload-tokens.ts`: item-scoped tokens with optional color and completion state.
- Modify `src/db/schema/items.ts` and `src/db/schema/index.ts`: expose image/staging relations and exports.
- Create `drizzle/0010_multi_image_color_qr.sql`: additive tables/columns/indexes and legacy-image backfill.
- Create `src/lib/colors/combine-suggestions.ts`: pure majority-vote color aggregation.
- Modify `src/lib/images/shrink-image.ts`: add a browser-safe suggestion extractor for QR/mobile uploads without duplicating canvas code.
- Modify `src/components/items/image-uploader.tsx`: multi-file local gallery and per-image suggestions.
- Modify `src/components/items/color-editor.tsx`: gallery state, combined suggestion, direct uploads, staged QR finalization.
- Modify `src/components/items/photo-handoff-qr.tsx`: shared multi-image capture, unique direct uploads, QR session polling, and attachment.
- Modify `src/routes/upload-photo.$token.tsx`: unauthenticated multi-photo phone session UI.
- Modify `src/routes/__root.tsx`: allow the token route through the public-page guard.
- Modify `src/server/functions/items/uploads.ts` and `src/server/functions/items/colors.ts`: unique keys and durable attachment APIs.
- Modify `src/server/functions/items/photo-handoff.ts` and `src/server/functions/items/photo-handoff-internals.ts`: multi-photo staging/session APIs.
- Modify `src/server/functions/items/items.server.ts`: hydrate item-color image collections.
- Create `src/__tests__/combine-suggestions.test.ts`: majority/tie behavior.
- Modify `src/__tests__/photo-handoff.test.ts`: staged multi-upload and lifecycle tests.
- Create `src/__tests__/item-color-images.test.ts`: attachment/primary-image persistence.
- Create `src/__tests__/image-uploader.test.tsx`: multi-file selection/removal and suggestion callback.
- Modify `src/__tests__/item-editor-validation.test.tsx` or add a route guard test: public token route behavior if the current test harness supports it.
- Modify `cypress/e2e/07-product-variants.cy.ts` or add `cypress/e2e/17-multi-image-qr.cy.ts`: authenticated desktop + stubbed S3 multi-image smoke.

### Task 1: Add the pure suggestion combiner

**Files:**
- Create: `src/lib/colors/combine-suggestions.ts`
- Test: `src/__tests__/combine-suggestions.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from 'vitest'
import { combineColorSuggestions } from '#/lib/colors/combine-suggestions'

describe('combineColorSuggestions', () => {
  it('chooses the most frequent palette suggestion', () => {
    expect(
      combineColorSuggestions([
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
        { name: 'Red', hex: '#cc2828', sampledHex: '#aa2222' },
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#102040' },
      ]),
    ).toEqual({ name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' })
  })

  it('keeps first-seen order for a tie', () => {
    expect(
      combineColorSuggestions([
        { name: 'Red', hex: '#cc2828', sampledHex: '#aa2222' },
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
      ]).name,
    ).toBe('Red')
  })

  it('returns null when no images produced a suggestion', () => {
    expect(combineColorSuggestions([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure.**

Run: `pnpm vitest run src/__tests__/combine-suggestions.test.ts`

Expected: FAIL because `combineColorSuggestions` does not exist.

- [ ] **Step 3: Implement the minimal pure helper.**

```ts
export interface ColorSuggestion {
  name: string
  hex: string
  sampledHex: string
}

export function combineColorSuggestions(
  suggestions: ReadonlyArray<ColorSuggestion>,
): ColorSuggestion | null {
  if (suggestions.length === 0) return null
  const counts = new Map<string, { count: number; first: number; value: ColorSuggestion }>()
  suggestions.forEach((value, first) => {
    const key = `${value.name}\u0000${value.hex.toLowerCase()}`
    const current = counts.get(key)
    counts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, first, value })
  })
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.first - b.first,
  )[0].value
}
```

- [ ] **Step 4: Run the test and verify GREEN.**

Run: `pnpm vitest run src/__tests__/combine-suggestions.test.ts`

Expected: 3 tests pass.

### Task 2: Add durable image and QR staging schema

**Files:**
- Create: `src/db/schema/item-color-images.ts`
- Create: `src/db/schema/picture-uploads.ts`
- Modify: `src/db/schema/picture-upload-tokens.ts`
- Modify: `src/db/schema/items.ts`
- Modify: `src/db/schema/index.ts`
- Create: `drizzle/0010_multi_image_color_qr.sql`
- Test: `src/__tests__/item-color-images.test.ts`

- [ ] **Step 1: Write the failing persistence test.** Use the existing real-test-DB fixture style to insert one item/color, insert two `itemColorImages`, and assert both rows exist while the legacy `itemColors.imageS3Key` is set only to the first key.

```ts
it('persists every image and keeps the first image as primary', async () => {
  const [first, second] = await attachItemColorImages({
    itemColorId: colorId,
    images: ['items/x/one.jpg', 'items/x/two.jpg'],
  })
  expect([first.imageS3Key, second.imageS3Key]).toEqual([
    'items/x/one.jpg',
    'items/x/two.jpg',
  ])
  expect((await db.query.itemColors.findFirst({ where: eq(itemColors.id, colorId) }))?.imageS3Key)
    .toBe('items/x/one.jpg')
})
```

- [ ] **Step 2: Run it and verify RED.**

Run: `pnpm vitest run src/__tests__/item-color-images.test.ts`

Expected: FAIL because the attachment schema/helper does not exist.

- [ ] **Step 3: Add the schema.** Define `itemColorImages` with `itemColorId`, unique `imageS3Key`, `sortOrder`, and timestamps. Define `pictureUploads` with token/item/color references, unique key, suggestion fields, `uploadedAt`, `attachedAt`, and timestamps. Change `pictureUploadTokens` to carry `itemId`, nullable `itemColorId`, and `completedAt` (the migration may retain a compatibility `consumed_at` column only if existing data requires it). Add relations from item → colors/images, color → images, token → uploads, and upload → item/color/token.

- [ ] **Step 4: Add migration `0010_multi_image_color_qr.sql`.** Create the two tables, indexes on token/status and color/sort order, add token item/color/completion columns, backfill `picture_upload_tokens.item_id` through `item_colors.item_id`, and insert one `item_color_images` row for each non-null legacy `item_colors.image_s3_key` using `ON CONFLICT DO NOTHING`. Do not delete or rewrite legacy keys.

- [ ] **Step 5: Implement `attachItemColorImages` server-side and run the focused test.** The helper must insert images in caller order, assign `sortOrder` from the current max plus one, and update `itemColors.imageS3Key` only when it is null. Use a transaction for the insert + primary update.

Run: `pnpm vitest run src/__tests__/item-color-images.test.ts`

Expected: PASS.

### Task 3: Build server-side upload/session primitives

**Files:**
- Modify: `src/server/functions/items/uploads.ts`
- Modify: `src/server/functions/items/colors.ts`
- Modify: `src/server/functions/items/photo-handoff-internals.ts`
- Modify: `src/server/functions/items/photo-handoff.ts`
- Modify: `src/__tests__/photo-handoff.test.ts`

- [ ] **Step 1: Add failing tests for the session lifecycle.** Cover: one token reserves and confirms two different keys; status returns both uploaded suggestions; completion blocks further redeem; expired tokens reject; a row from a different token rejects; attaching requires a color belonging to the token’s item.

```ts
it('allows several confirmed uploads before completion', async () => {
  const token = await createFixtureToken({ itemId, itemColorId: colorId })
  const first = await reservePhotoUpload(token.token)
  const second = await reservePhotoUpload(token.token)
  await confirmPhotoUploadRow(token.token, first.id, navySuggestion)
  await confirmPhotoUploadRow(token.token, second.id, navySuggestion)
  await expect(getPhotoUploadStatus({ token: token.token })).resolves.toMatchObject({
    status: 'pending',
    uploads: expect.arrayContaining([
      expect.objectContaining({ id: first.id, suggestedColorName: 'Navy' }),
      expect.objectContaining({ id: second.id, suggestedColorName: 'Navy' }),
    ]),
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `pnpm vitest run src/__tests__/photo-handoff.test.ts`

Expected: FAIL against the current single-use token behavior/API.

- [ ] **Step 3: Make direct upload keys unique and add authenticated attachment.** Change `getItemImageUploadUrl` to generate `items/<itemId>/<colorId>/<uuid>.jpg`, add `attachItemColorImage` input validation, and keep `setItemColorImage` as a compatibility wrapper that attaches one image.

- [ ] **Step 4: Implement token internals.** `validateToken` must load item + optional color, reject missing/completed/expired tokens, and `reserveUpload` must enforce the 12-image limit and insert a pending `pictureUploads` row with a unique key. `confirmUpload` must use the token + upload ID pair, validate the six-digit suggestion fields, and set `uploadedAt`. `completeToken` must atomically set `completedAt` if still open and be idempotent for repeated calls.

- [ ] **Step 5: Implement server functions.** Expose:

```ts
createPhotoUploadSession({ itemId, itemColorId? })
getPhotoUploadStatus({ token })
redeemPhotoUploadToken({ token, contentType })
confirmPhotoUpload({ token, uploadId, suggestion? })
completePhotoUploadSession({ token })
attachPhotoSessionImages({ token, itemColorId })
```

Only the create/attach functions require the admin/supervisor session. Token operations and status do not call `requireSession`; they validate the bearer token and item/color scope. Status includes uploaded image IDs, public image URLs, and suggestion metadata but no item names or unrelated rows.

- [ ] **Step 6: Run the focused session tests and the existing photo tests.**

Run: `pnpm vitest run src/__tests__/photo-handoff.test.ts src/__tests__/item-color-images.test.ts`

Expected: all focused tests pass.

### Task 4: Convert the local image picker into a multi-image gallery

**Files:**
- Modify: `src/components/items/image-uploader.tsx`
- Modify: `src/lib/images/shrink-image.ts`
- Modify: `src/components/items/color-editor.tsx`
- Test: `src/__tests__/image-uploader.test.tsx`

- [ ] **Step 1: Write failing component tests.** Render `ImageUploader`, fire a two-file change, assert two previews and two suggestions are emitted, then click Remove on one and assert only the remaining image is emitted. Mock only `URL.createObjectURL`, `Image`, canvas, and `toBlob` at the browser boundary; test the component’s behavior rather than implementation details.

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `pnpm vitest run src/__tests__/image-uploader.test.tsx`

Expected: FAIL because the component accepts only one file and has no remove action.

- [ ] **Step 3: Refactor image normalization into a reusable `analyzeImage(file)` helper.** It must return `{ blob, previewUrl, suggestion }`, revoke temporary object URLs after loading, preserve the existing 1600px JPEG behavior, and use the existing `extractDominantLab`/`matchPaletteLab` pipeline.

- [ ] **Step 4: Add the gallery UI.** Use a camera input without `multiple` and a library input with `multiple`; cap accepted files at 12; process files in selection order; render previews with accessible Remove buttons; call `onAssetsChange(assets)` after every add/remove. Keep the current Upload image button wording when empty and show Take photo + Upload photos actions when populated.

- [ ] **Step 5: Update `ColorEditor`.** Store normalized local assets plus an optional completed QR session `{ token, uploads }`, call `combineColorSuggestions` across both sources, update the existing `ColorPicker`, and render `PhotoCapture` with `{ itemId, onSessionCompleted }` next to the local gallery actions. On Save: create the color, upload every local blob using unique keys, attach each image in order, call `attachPhotoSessionImages({ token, itemColorId: createdColor.id })` for the staged QR session, and invalidate through the existing caller. Show one error, keep the dialog open on failure, and prevent duplicate saves.

- [ ] **Step 6: Run the focused component, color, and existing color tests.**

Run: `pnpm vitest run src/__tests__/image-uploader.test.tsx src/__tests__/combine-suggestions.test.ts src/__tests__/extract-dominant.test.ts src/__tests__/match-palette.test.ts`

Expected: all pass.

### Task 5: Integrate multi-photo QR and authenticated finalization

**Files:**
- Modify: `src/components/items/photo-handoff-qr.tsx`
- Modify: `src/routes/items/$articleNumber.tsx`
- Modify: `src/routes/upload-photo.$token.tsx`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Add failing UI tests for the session state transitions.** Assert that a QR session renders Add another photo/Done on the phone, and that the desktop callback is not fired until status reports completion and attachment succeeds.

- [ ] **Step 2: Run them and verify RED.**

Run: `pnpm vitest run src/__tests__/photo-handoff-ui.test.tsx`

Expected: FAIL because the current page handles one photo and the desktop component has no completion/attachment path.

- [ ] **Step 3: Update `PhotoCapture` props and local direct-upload flow.** Use this explicit interface: `type CompletedPhotoSession = { token: string; uploads: Array<{ id: string; imageUrl: string; suggestedColorName: string | null; suggestedColorHex: string | null; sampledHex: string | null }> }`; accept `itemId`, optional `itemColorId`, `onUploaded`, and optional `onSessionCompleted`. Use multi-file gallery state, call unique-key upload/attach for each local blob, and keep the current mobile/desktop device split. Existing-color usage passes both IDs and attaches on completion; Add color passes only `itemId`, hides the attach-until-save path behind `onSessionCompleted`, and lets `ColorEditor` own the returned session.

- [ ] **Step 4: Update desktop QR flow.** Generate a session with item/color scope, poll status every 2 seconds, show “Scan once, add several photos,” and when status becomes completed call `onSessionCompleted({ token, uploads })`. The component must not call `attachPhotoSessionImages` when `onSessionCompleted` is provided; the existing-color wrapper supplies a callback that attaches immediately, while `ColorEditor` stores the returned session and attaches it after the new color is created. Render every returned upload as a gallery thumbnail and use its stored suggestion in the combined vote.

- [ ] **Step 5: Update the phone route.** Keep it outside the authenticated app shell, use one camera capture plus a multiple-file picker, show uploaded thumbnails and retry controls, call redeem → PUT → confirm for each image, and expose Done. Done calls `completePhotoUploadSession`; it does not call login or any auth client method. Reset the file input after each selection and show expired/completed states.

- [ ] **Step 6: Add `/upload-photo/$token` to `publicPaths`.** Verify the route match uses the generated route’s `/upload-photo/$token` full path, and do not add the token to any application session or cookie.

- [ ] **Step 7: Run focused UI tests and typecheck.**

Run: `pnpm vitest run src/__tests__/photo-handoff-ui.test.tsx src/__tests__/image-uploader.test.tsx && pnpm typecheck`

Expected: all tests pass and TypeScript reports no errors.

### Task 6: Hydrate galleries and preserve compatibility

**Files:**
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/components/items/item-card.tsx` only if the query shape requires it
- Modify: `src/components/items/item-picker.tsx` only if the query shape requires it
- Modify: `src/routes/items/$articleNumber.tsx`
- Test: `src/__tests__/item-color-images.test.ts`

- [ ] **Step 1: Add a failing query assertion.** Fetch an item with two attached images and assert `product.colors[n].images` is ordered by `sortOrder`, while `imageS3Key` remains the primary string.

- [ ] **Step 2: Run it and verify RED.**

Run: `pnpm vitest run src/__tests__/item-color-images.test.ts`

Expected: FAIL because item detail hydration currently returns only `colors: true`.

- [ ] **Step 3: Extend `ITEM_DETAIL_WITH`.** Include color image relations ordered by `sortOrder`, keeping all existing color columns and variant fields unchanged.

- [ ] **Step 4: Render the gallery.** In the item detail page, display the active color’s image collection with keyboard-accessible thumbnails and a primary preview; show the existing no-image text when empty. Keep item cards and POS consumers on `imageS3Key`.

- [ ] **Step 5: Run the query and existing item/variant tests.**

Run: `pnpm vitest run src/__tests__/item-color-images.test.ts src/__tests__/create-item-materializes-variants.test.ts src/__tests__/variants.test.ts`

Expected: all pass.

### Task 7: Add end-to-end coverage and run adversarial review

**Files:**
- Create or modify: `cypress/e2e/17-multi-image-qr.cy.ts`
- Modify: `cypress/support/cleanup.ts` if new fixture tables need explicit cleanup
- Modify: `README.md` only if the project documents local S3 setup here

- [ ] **Step 1: Add an E2E test for Add color.** Log in as admin, open an item, add a color, select two fixture images, assert two thumbnails and the majority suggestion, stub S3 PUTs, save, reload, and assert both images are present while the color primary image remains available.

- [ ] **Step 2: Add an E2E test for QR public access.** Create a session through the authenticated desktop path, visit the returned `/upload-photo/<token>` URL in a context without the app session, assert no login form appears, upload two images with stubbed PUTs, finish Done, return to desktop, and assert the gallery receives both images.

- [ ] **Step 3: Run the E2E tests and fix only feature-caused failures.**

Run: `pnpm test:e2e --spec cypress/e2e/17-multi-image-qr.cy.ts`

Expected: the new spec passes with S3 requests stubbed.

- [ ] **Step 4: Perform the adversarial implementation review.** Re-read the spec and diff. Specifically check: new-color QR has no color ID before Save; token operations never require a session; cross-token image IDs are rejected; unique keys cannot overwrite; Done is required; failed PUTs can retry; 12-image cap is enforced; old `imageS3Key` consumers still compile; public route is not accidentally widened to other app routes.

- [ ] **Step 5: Fix every discovered issue and rerun the affected test before continuing.** Do not record an issue as accepted unless it is explicitly out of scope in the spec.

### Task 8: Full verification and handoff

- [ ] **Step 1: Run formatting and lint.**

Run: `pnpm format && pnpm lint`

Expected: Prettier reports all files formatted and ESLint exits 0 with no warnings.

- [ ] **Step 2: Run the full unit/integration suite.**

Run: `pnpm test`

Expected: Vitest exits 0 with zero failed tests.

- [ ] **Step 3: Run the production build.**

Run: `pnpm build`

Expected: Vite builds successfully and emits the server bundle.

- [ ] **Step 4: Inspect the final diff and status.**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the feature files, spec, plan, and any generated migration/route updates are changed. Preserve the user’s pre-existing modifications.
