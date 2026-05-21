/**
 * Browser verification test — verifies the actual user experience:
 * Login page → Dashboard → Navigate all sections
 */
describe("Browser Verification", () => {
  const testEmail = `verify-${Date.now()}@test.com`
  const testPassword = "VerifyPass123!"

  before(() => {
    cy.task("cleanupAllTestData", null)

    // Create test admin user
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: { name: "Verify Admin", email: testEmail, password: testPassword },
    })
    cy.task(
      "dbQuery",
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("shows login page when not authenticated", () => {
    cy.clearAllCookies()
    cy.clearAllSessionStorage()
    cy.clearAllLocalStorage()
    cy.visit("/login")
    cy.contains("Welcome back", { timeout: 10000 }).should("be.visible")
    // Sign-up CTA is only shown when no admin exists; once the before() hook
    // creates one, the page falls back to the "Welcome back" sign-in form.
    cy.get("input#email").should("be.visible")
    cy.get("input#password").should("be.visible")
    cy.screenshot("verify-01-login-page")
  })

  it("rejects wrong password (stays on login page)", () => {
    cy.visit("/login")
    cy.get("input#email").type(testEmail)
    cy.get("input#password").type("wrongpassword")
    cy.get("button[type='submit']").click()
    // After a failed login the user stays on /login. We don't assert on
    // the specific error copy because it can vary by auth config.
    cy.wait(1500)
    cy.url().should("include", "/login")
    cy.get("input#password").should("be.visible")
    cy.screenshot("verify-02-login-error")
  })

  it("logs in successfully and shows dashboard", () => {
    cy.visit("/login")
    cy.get("input#email").clear().type(testEmail)
    cy.get("input#password").clear().type(testPassword)
    cy.get("button[type='submit']").click()

    // Should redirect to dashboard
    cy.contains("Dashboard", { timeout: 10000 }).should("be.visible")
    cy.contains("Supply Routes").should("be.visible")
    cy.screenshot("verify-03-dashboard")
  })

  it("navigates to supply routes (no error)", () => {
    cy.loginAndCache(testEmail, testPassword)
    cy.visit("/supply")
    cy.contains("Supply Routes", { timeout: 10000 }).should("be.visible")
    cy.should("not.contain", "Something went wrong")
    cy.screenshot("verify-04-supply-routes")
  })

  it("navigates to suppliers (no error)", () => {
    cy.loginAndCache(testEmail, testPassword)
    cy.visit("/supply/suppliers")
    cy.contains("Suppliers", { timeout: 10000 }).should("be.visible")
    cy.should("not.contain", "Something went wrong")
    cy.screenshot("verify-05-suppliers")
  })

  it("navigates to store stock (no error)", () => {
    cy.loginAndCache(testEmail, testPassword)
    cy.visit("/store")
    cy.contains("Store Stock", { timeout: 10000 }).should("be.visible")
    cy.should("not.contain", "Something went wrong")
    cy.screenshot("verify-06-store-stock")
  })

  it("navigates to reports (no error)", () => {
    cy.loginAndCache(testEmail, testPassword)
    cy.visit("/reports")
    cy.contains("Financial Reports", { timeout: 10000 }).should("be.visible")
    cy.should("not.contain", "Something went wrong")
    cy.screenshot("verify-07-reports")
  })

  it("navigates to settings (no error)", () => {
    cy.loginAndCache(testEmail, testPassword)
    cy.visit("/settings")
    cy.contains("Settings", { timeout: 10000 }).should("be.visible")
    cy.should("not.contain", "Something went wrong")
    cy.screenshot("verify-08-settings")
  })
})
