/**
 * Receiving page prerequisites + dropdown bug regression.
 */
describe("Receiving prereqs", () => {
  const testEmail = `e2e-receiving-${Date.now()}@test.com`
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
      body: {
        name: "E2E Receiving Admin",
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
    cy.task("cleanupAllTestData", null)
  })

  it("shows the empty state with a CTA when no receivable routes exist", () => {
    cy.visit("/store/receiving")
    waitForHydration()
    cy.contains("Receive Goods").should("be.visible")
    cy.contains("No supply routes ready to receive").should("be.visible")
    cy.contains("a", "Go to Supply Routes")
      .should("have.attr", "href", "/supply")
    cy.screenshot("receiving-empty-state")
  })
})
