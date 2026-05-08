describe("Auth email flows", () => {
  const adminEmail = `e2e-admin-${Date.now()}@test.com`
  const adminPassword = "AdminPass1234"

  before(() => {
    cy.cleanupAllTestData()
    cy.signup("E2E Admin", adminEmail, adminPassword).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
    })
    cy.dbQuery(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${adminEmail}'`,
    )
    cy.loginAndCache(adminEmail, adminPassword)
  })

  after(() => {
    cy.cleanupAllTestData()
  })

  it("forgot-password page always shows generic success", () => {
    cy.visit("/forgot-password")
    cy.get("input#email").type("nobody-here@example.com")
    cy.contains("button", "Send reset link").click()
    cy.contains("If an account exists for that email").should("be.visible")
  })

  it("admin can invite a user; row shows Invited status", () => {
    cy.loginAndCache(adminEmail, adminPassword)
    cy.visit("/settings/users")
    cy.contains("button", "Invite user").click()
    cy.get("input#invite-name").type("Invitee Person")
    const inviteeEmail = `invitee-${Date.now()}@test.com`
    cy.get("input#invite-email").type(inviteeEmail)
    cy.contains("button", "Send invite").click()
    cy.contains(inviteeEmail).should("be.visible")
    cy.contains("tr", inviteeEmail).contains("Invited")
    cy.contains("tr", inviteeEmail).contains("Resend invite")
  })
})
