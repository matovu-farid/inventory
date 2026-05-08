describe("Authentication", () => {
  const testUser = {
    name: "Test Admin",
    email: `test-admin-${Date.now()}@test.com`,
    password: "TestPassword123!",
  }

  before(() => {
    // Wipe any prior bootstrap admin so signup is allowed
    cy.cleanupAllTestData()
  })

  after(() => {
    cy.cleanupTestUser(testUser.email)
  })

  it("signs up the bootstrap admin", () => {
    cy.signup(testUser.name, testUser.email, testUser.password).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
    })
  })

  it("blocks sign-in until email is verified", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { Origin: "http://localhost:3000" },
      body: { email: testUser.email, password: testUser.password },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(200)
    })
  })

  it("signs in after manually marking email verified", () => {
    cy.dbQuery(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${testUser.email}'`,
    )
    cy.login(testUser.email, testUser.password)
    cy.request("/api/auth/get-session").then((resp) => {
      expect(resp.status).to.eq(200)
      expect(resp.body.user.email).to.eq(testUser.email)
    })
  })

  it("blocks a second self-signup", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: {
        email: `second-${Date.now()}@test.com`,
        password: "Whatever1234",
        name: "Second",
      },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(200)
    })
  })
})
