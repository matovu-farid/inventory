describe("Authentication", () => {
  const testUser = {
    name: "Test Admin",
    email: `test-admin-${Date.now()}@test.com`,
    password: "TestPassword123!",
  }

  after(() => {
    cy.cleanupTestUser(testUser.email)
  })

  it("signs up a new user", () => {
    cy.signup(testUser.name, testUser.email, testUser.password).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
    })
  })

  it("signs in with valid credentials", () => {
    cy.login(testUser.email, testUser.password)
    // Session cookie should now be set
    cy.request("/api/auth/get-session").then((resp) => {
      expect(resp.status).to.eq(200)
      expect(resp.body.user.email).to.eq(testUser.email)
    })
  })

  it("rejects invalid credentials", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/sign-in/email",
      body: { email: testUser.email, password: "wrong" },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(200)
    })
  })
})
