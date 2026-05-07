/**
 * Setup Checklist E2E.
 *
 * Verifies the empty-DB state shows hard issues with CTAs, and the
 * dashboard banner is shown when hard prereqs are failing.
 */
describe("Setup Checklist", () => {
  const testEmail = `e2e-setup-${Date.now()}@test.com`
  const testPassword = "E2EPassword123!"

  function waitForHydration() {
    cy.get("body", { timeout: 10000 }).should("be.visible")
    cy.wait(1500)
  }

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: { name: "E2E Setup Admin", email: testEmail, password: testPassword },
    })
    cy.task(
      "dbQuery",
      `UPDATE "user" SET role = 'admin' WHERE email = '${testEmail}'`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("shows blocking issues with CTAs on empty DB", () => {
    cy.visit("/settings/setup")
    waitForHydration()
    cy.contains("Setup Checklist").should("be.visible")
    cy.contains("blocking").should("be.visible")
    cy.contains("No supply routes ready to receive").should("be.visible")
    cy.contains("a", "Go to Supply Routes").should(
      "have.attr",
      "href",
      "/supply",
    )
    cy.screenshot("setup-checklist-empty")
  })

  it("dashboard shows the setup banner when hard prereqs failing", () => {
    cy.visit("/")
    waitForHydration()
    cy.contains("setup").should("be.visible")
    cy.contains("attention").should("be.visible")
  })
})
