import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * 90-day redirect shim for the old `/products` URL.
 *
 * Per spec §9 in docs/superpowers/specs/2026-05-24-category-item-variant-design.md,
 * the catalog rename in issue #3 keeps the old `/products/*` URLs navigable
 * for 90 days so external links, bookmarks, and printed handouts continue
 * working while users learn the new `/items/*` URL shape.
 *
 * Window: 2026-05-26 + 90 days = 2026-08-24.
 * After 2026-08-24 this file (and src/routes/products/$articleNumber.tsx)
 * can be deleted in a follow-up cleanup PR.
 */
export const Route = createFileRoute("/products/")({
  beforeLoad: () => {
    throw redirect({ to: "/items", replace: true })
  },
})
