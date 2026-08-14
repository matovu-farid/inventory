# Multi-image color capture and QR handoff

## Goal

Allow an admin or supervisor to add a color using several product photos, upload those photos from the current device or a phone reached through QR, and receive one automatic color suggestion without asking the phone user to sign in again.

## Approved interaction

The existing Add color dialog becomes a shared photo gallery:

- The user can take a photo, choose multiple files, or generate a QR code for a phone.
- Each selected or uploaded image appears in the gallery and can be removed before the color is saved.
- Every image produces a palette suggestion using the existing client-side dominant-color extraction.
- The gallery combines suggestions by majority vote and fills the existing color name and hex controls. The user can edit either value or choose a palette tile before saving.
- Several photos represent one color. The feature suggests one color, not several new colors, because the dialog creates one item color at a time.
- The first attached image remains the primary image used by existing item cards and stock views. All attached images are retained for the color detail gallery.

On desktop, “Take with phone (QR)” creates a 15-minute session scoped to the parent item and, when available, the selected item color. This matters in Add color: the color does not exist until the user saves the dialog, so QR images are staged against the item and attached to the newly created color after Save. Scanning the URL opens the upload page directly; `/upload-photo/$token` is a public route because the high-entropy token is the session’s bearer authorization. The phone can add multiple photos and taps Done to close the session. The desktop polls the session and imports the received photos and suggestions into the gallery. A user can retry an individual failed upload before finishing.

## Data model

Add an `item_color_images` table for durable attachments:

- `id` UUID primary key
- `item_color_id` FK to `item_colors`, cascading on color deletion
- `image_s3_key` text, unique
- `sort_order` integer, default 0
- `created_at` timestamp

Add a separate `picture_uploads` staging table for QR session files:

- `id` UUID primary key
- `token_id` FK to `picture_upload_tokens`, cascading on token deletion
- `item_id` FK to `items`, cascading on item deletion
- nullable `item_color_id` FK to `item_colors`, cascading on color deletion
- `image_s3_key` text, unique
- `suggested_color_name`, `suggested_color_hex`, and `sampled_hex`, all nullable
- `uploaded_at` nullable until the PUT is confirmed
- `attached_at` nullable until an authenticated desktop action attaches the row to an item color
- `created_at` timestamp

Keep `item_colors.image_s3_key` as the compatibility primary-image field. On the first successful attachment, populate it if it is null. Existing rows remain valid; the detail query will expose both the legacy primary and the new image collection. Existing image URLs and item-card behavior therefore do not change.

Change photo handoff from a single-use upload to a closeable session:

- The token is scoped to one `item_id` and may carry an existing `item_color_id`, has the existing 15-minute expiry, and can be used for multiple reserved staging rows.
- Redeeming a token creates one pending `picture_uploads` row and returns a unique S3 key and presigned PUT URL.
- Confirming an upload marks only that staging row uploaded and stores its suggestion metadata.
- Completing the session sets the token’s completion timestamp. Redeem/confirm calls reject completed, expired, or missing tokens.
- Status returns only the token’s state and uploaded image metadata needed by the desktop owner; it does not expose unrelated catalog data.
- An authenticated `attachPhotoSessionImages` operation accepts the token and a final `item_color_id`, verifies that the color belongs to the token’s item, inserts one `item_color_images` row per uploaded staging row, sets the first primary image when needed, and marks staging rows attached. It is used after Save for Add color and after Done for an existing color.

Direct uploads use the same image-row attachment path and unique key format, so local and QR uploads cannot overwrite one another. Existing single-image callers remain supported through the primary-image field and are migrated to the new attachment helper.

## Components and flow

- `ImageUploader` becomes a multi-file gallery component with a single-image capture input, a multiple-file library input, per-image previews, remove actions, and a callback containing normalized image blobs plus color suggestions.
- `ColorEditor` owns the pending gallery, combines suggestions, creates the item color, uploads/attaches every pending image, and keeps the save button disabled while work is in progress.
- `PhotoCapture` provides the same gallery actions for an existing color, while `ColorEditor` passes the parent item ID so it can also start a staged QR session before a color exists. Its desktop QR branch starts a session and polls; its mobile branch supports multiple library selections and repeatable single-photo camera captures.
- `upload-photo.$token` becomes a public multi-photo session page. It shows uploaded thumbnails, supports Add another photo, retries failed uploads, and closes with Done.
- The root public-route allowlist includes `/upload-photo/$token` so a phone with no application session is not redirected to login. The upload server functions remain token-validated and do not rely on the absent session.

## Color aggregation

Each image keeps its individual palette suggestion. The shared pure helper chooses the most frequent palette entry; ties are resolved by first-seen order. The helper also returns the sampled hex from the first winning suggestion for the existing “Sampled from image” affordance. Manual edits always win after the user changes the fields.

## Error handling and security

- Validate image content types, a maximum of 12 images per gallery/session, and color metadata at the server boundary. Reject malformed hex values and suggestions that are not valid six-digit hex strings.
- Keep uploads client-side shrunk to the existing 1600px JPEG target.
- Do not require auth on the QR landing route, but never accept an arbitrary item/color ID from that page. Every operation resolves the target item through the token and, when a color is present, verifies the color belongs to that item and the reserved image row belongs to that token.
- Make completion idempotent from the UI: repeated Done calls report the already-completed state, while new uploads are rejected after completion.
- If an upload succeeds but the metadata confirmation fails, show a retryable error and leave the session open; the server must not mark the token complete until the user taps Done.
- If a user closes Add color without saving, staged rows remain unattached and become harmless expired-session storage; cleanup of expired staging rows is a follow-up maintenance task, not part of this UI change.
- Do not delete existing S3 objects or legacy primary keys as part of this feature.

## Testing and acceptance criteria

Unit/integration tests must prove:

1. Multiple suggestions produce the majority palette, including deterministic tie behavior.
2. A direct multi-image save creates one color and one image row per uploaded image, with the first image as the primary compatibility image.
3. QR sessions can reserve and confirm several images, return their suggestions to the owner, and close only when Done is called.
4. Missing, expired, completed, cross-token, and malformed upload requests are rejected.
5. The upload route is reachable without an application session while authenticated item management remains protected.
6. Existing one-image and item-card behavior still works.

The implementation will add focused component tests for gallery selection/removal and public-route tests, plus the relevant Cypress smoke path for the QR/multi-image flow where the test environment can stub S3 PUTs.

## Out of scope

- Creating multiple item colors automatically from one session.
- Server-side computer vision or external color-recognition APIs.
- Changing existing catalog, stock, or POS color semantics.
- Deleting/reprocessing old S3 images.
