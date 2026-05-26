/**
 * Item categories admin E2E test.
 *
 * Walks the admin through the four CRUD operations on /settings/categories:
 *   1. Visit the page (lists seed "Uncategorized" plus our scratch row).
 *   2. Create a new category.
 *   3. Rename it.
 *   4. Delete it.
 *
 * Screenshots capture each step so a regression in the admin UI surfaces
 * visually in CI artifacts.
 */
describe("Item categories admin", () => {
  const testEmail = `e2e-categories-${Date.now()}@test.com`
  const testPassword = "E2EPassword123!"
  // Keep `renamedName` from being a superstring of `seedName` so we can
  // assert that the old name disappears from the table after rename.
  const stamp = Date.now()
  const seedName = `E2E Original ${stamp}`
  const renamedName = `E2E Renamed ${stamp}`

  function waitForHydration() {
    cy.get("body", { timeout: 10000 }).should("be.visible")
    // TanStack Start defines `self.$_TSR` in its boot script and deletes
    // it once the SSR stream has closed and React has hydrated (see the
    // inline `$_TSR.c()` in the head). Cypress's `should` callback
    // retries until the predicate holds, so this is a deterministic
    // hydration signal — unlike `cy.wait(2500)`, which was racy on CI
    // runners with larger client bundles. PR #20 broadened the schema
    // barrel (adds `variants` joins on shop_stock / store_stock) which
    // nudged hydration past the old 2.5s threshold and surfaced the
    // regression in 13-item-categories (dialog click landed before
    // DialogTrigger's handler was wired up).
    cy.window({ timeout: 15000 }).should((win) => {
      expect((win as unknown as { $_TSR?: unknown }).$_TSR).to.be.undefined
    })
  }

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.task(
      "dbQuery",
      `DELETE FROM item_categories WHERE name <> 'Uncategorized'`,
    )
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: {
        name: "E2E Categories Admin",
        email: testEmail,
        password: testPassword,
      },
    })
    cy.task(
      "dbQuery",
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
  })

  after(() => {
    cy.task(
      "dbQuery",
      `DELETE FROM item_categories WHERE name <> 'Uncategorized'`,
    )
    cy.task("cleanupAllTestData", null)
  })

  it("creates, renames, and deletes a category", () => {
    cy.visit("/settings/categories")
    waitForHydration()
    cy.contains("Item categories").should("be.visible")
    // Seed row should always be present.
    cy.contains("Uncategorized").should("be.visible")
    cy.screenshot("01-categories-initial")

    // ─── Create ──────────────────────────────────────────────────────────
    cy.contains("button", "New category").click()
    cy.get('[role="dialog"]', { timeout: 10000 }).should("be.visible")
    cy.get('[role="dialog"]').within(() => {
      cy.get("#category-name").type(seedName)
      cy.contains("button", "Create").click()
    })
    cy.get('[role="dialog"]', { timeout: 10000 }).should("not.exist")
    cy.contains(seedName).should("be.visible")
    cy.screenshot("02-categories-after-create")

    // ─── Rename ──────────────────────────────────────────────────────────
    cy.contains("tr", seedName).within(() => {
      cy.contains("button", "Rename").click()
    })
    cy.get('[role="dialog"]', { timeout: 10000 }).should("be.visible")
    cy.get('[role="dialog"]').within(() => {
      cy.get("#category-name").should("have.value", seedName).clear().type(renamedName)
      cy.contains("button", "Save").click()
    })
    cy.get('[role="dialog"]', { timeout: 10000 }).should("not.exist")
    cy.contains(renamedName).should("be.visible")
    cy.contains("td", seedName).should("not.exist")
    cy.screenshot("03-categories-after-rename")

    // ─── Delete ──────────────────────────────────────────────────────────
    cy.on("window:confirm", () => true)
    cy.contains("tr", renamedName).within(() => {
      cy.contains("button", "Delete").click()
    })
    cy.contains("td", renamedName).should("not.exist")
    cy.screenshot("04-categories-after-delete")
  })
})
