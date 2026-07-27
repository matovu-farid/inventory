describe('Auth email flows', () => {
  const adminEmail = `e2e-admin-${Date.now()}@test.com`
  const adminPassword = 'AdminPass1234'

  before(() => {
    cy.cleanupAllTestData()
    cy.signup('E2E Admin', adminEmail, adminPassword).then((resp) => {
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

  it('forgot-password page always shows generic success', () => {
    cy.visit('/forgot-password')
    // Wait for React hydration so the form's onSubmit handler attaches.
    // Without hydration the form does a default browser POST which loses
    // client state and never shows the success branch.
    cy.get('input#email').should('be.visible')
    cy.wait(4000)
    cy.get('input#email').type('nobody-here@example.com')
    // Submit the form directly so we don't depend on the button being a
    // hydrated React click target.
    cy.get('form').submit()
    cy.contains('If an account exists for that email', {
      timeout: 15000,
    }).should('be.visible')
  })

  it('admin can invite a user; row shows Invited status', () => {
    cy.loginAndCache(adminEmail, adminPassword)
    cy.visit('/settings/users')
    // Wait for hydration before clicking the trigger so Radix can wire up.
    cy.contains('button', 'Invite user').should('be.visible')
    cy.wait(1500)
    cy.contains('button', 'Invite user').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
    cy.get('input#invite-name').type('Invitee Person')
    const inviteeEmail = `invitee-${Date.now()}@test.com`
    cy.get('input#invite-email').type(inviteeEmail)
    cy.contains('button', 'Send invite').click()
    cy.contains(inviteeEmail).should('be.visible')
    cy.contains('tr', inviteeEmail).contains('Invited')
    cy.contains('tr', inviteeEmail).contains('Resend invite')
  })
})
