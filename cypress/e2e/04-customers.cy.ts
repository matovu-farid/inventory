/**
 * Customers E2E test
 *
 * Verifies the /customers route renders, allows creating a customer,
 * and shows the new customer in the list. Captures screenshots for
 * each meaningful step.
 */
describe("Customers", () => {
  const testEmail = `e2e-customers-${Date.now()}@test.com`
  const testPassword = "E2EPassword123!"

  function waitForHydration() {
    cy.get("body", { timeout: 10000 }).should("be.visible")
    // TanStack Start defines `self.$_TSR` in its boot script and deletes
    // it once the SSR stream has closed and React has hydrated (see the
    // inline `$_TSR.c()` in the head). Cypress's `should` callback
    // retries until the predicate holds, so this is a deterministic
    // hydration signal — unlike `cy.wait(1500)`, which was racy on CI
    // runners with larger client bundles. PR #11 broadened the schema
    // barrel (adds `variants`) which nudged hydration past the old
    // 1.5s threshold and surfaced the regression in 04-customers.
    cy.window({ timeout: 15000 }).should((win) => {
      expect((win as unknown as { $_TSR?: unknown }).$_TSR).to.be.undefined
    })
  }

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: { name: "E2E Customer Admin", email: testEmail, password: testPassword },
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
    cy.task("cleanupAllTestData", null)
  })

  it("renders the empty customers page", () => {
    cy.visit("/customers")
    waitForHydration()
    cy.contains("Customers").should("be.visible")
    cy.contains("No customers yet").should("be.visible")
    cy.screenshot("customers-empty")
  })

  it("creates a customer", () => {
    cy.visit("/customers")
    waitForHydration()
    cy.contains("button", "Add Customer").click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("be.visible")

    cy.get('[role="dialog"]').within(() => {
      cy.get("input#name").type("Acme Trading Co.")
      cy.get("input#phone").type("+256-700-000000")
      cy.get("input#notes").type("Trusted long-term customer")
      cy.screenshot("customers-dialog-filled")
      cy.contains("button", "Save").click()
    })

    cy.get('[role="dialog"]', { timeout: 5000 }).should("not.exist")
    cy.contains("Acme Trading Co.").should("be.visible")
    cy.contains("+256-700-000000").should("be.visible")
    cy.screenshot("customers-after-create")
  })

  it("shows the customer count after creation", () => {
    cy.visit("/customers")
    waitForHydration()
    cy.contains("1 customer").should("be.visible")
    cy.screenshot("customers-list-with-one")
  })
})
