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
  const seedName = `E2E Cat ${Date.now()}`
  const renamedName = `${seedName} Renamed`

  function waitForHydration() {
    cy.get("body", { timeout: 10000 }).should("be.visible")
    cy.wait(1000)
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
    cy.get('[data-testid="new-category-button"]').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("be.visible")
    cy.get('[data-testid="category-name-input"]').type(seedName)
    cy.get('[data-testid="submit-category"]').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("not.exist")
    cy.contains(seedName).should("be.visible")
    cy.screenshot("02-categories-after-create")

    // ─── Rename ──────────────────────────────────────────────────────────
    cy.get(`[data-testid="rename-${seedName}"]`).click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("be.visible")
    cy.get('[data-testid="category-name-input"]')
      .should("have.value", seedName)
      .clear()
      .type(renamedName)
    cy.get('[data-testid="submit-category"]').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("not.exist")
    cy.contains(renamedName).should("be.visible")
    cy.contains(seedName).should("not.exist")
    cy.screenshot("03-categories-after-rename")

    // ─── Delete ──────────────────────────────────────────────────────────
    cy.on("window:confirm", () => true)
    cy.get(`[data-testid="delete-${renamedName}"]`).click()
    cy.contains(renamedName).should("not.exist")
    cy.screenshot("04-categories-after-delete")
  })
})
