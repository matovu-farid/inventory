describe('Guided supply route entry', () => {
  const testEmail = `guided-route-${Date.now()}@test.com`
  const testPassword = 'GuidedRoutePassword123!'

  before(() => {
    cy.cleanupAllTestData()
    cy.signup('Guided Route Admin', testEmail, testPassword)
    cy.dbQuery(
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
  })

  after(() => {
    cy.cleanupAllTestData()
  })

  it('resumes an open route through the visible steps', () => {
    cy.dbQuery(
      `INSERT INTO supply_routes (name, status) VALUES ('Guided Test Route', 'open') RETURNING id`,
    ).then((routeRows: Array<{ id: string }>) => {
      cy.visit('/supply/new')
      cy.waitForHydration()
      cy.contains('Continue most recent route').should('be.visible')
      cy.contains('Select another open route').should('be.visible')
      cy.contains('Start a new route').should('be.visible')
      cy.contains('button', 'Continue').click()
      cy.contains('Edit route details').should('be.visible')
      cy.contains('Route basics', { timeout: 10000 }).should('be.visible')
      cy.contains('Step 4 of 4').should('be.visible')

      cy.contains('Route suppliers').should('not.exist')
      cy.contains('Review route entry').should('be.visible')

      cy.contains('button', 'Edit route details').click()
      cy.contains('Step 1 of 4').should('be.visible')
      cy.contains('button', 'Items').click()
      cy.contains('Step 2 of 4').should('be.visible')
      cy.contains('Receipts').should('be.visible')

      cy.contains('Save and exit').click()
      cy.location('pathname').should('eq', `/supply/${routeRows[0].id}`)
      cy.visit(`/supply/${routeRows[0].id}/entry?step=items`)
      cy.waitForHydration()
      cy.contains('Step 2 of 4').should('be.visible')
      cy.contains('Receipts').should('be.visible')

      cy.contains('button', 'Expenses').click()
      cy.contains('Route expenses').should('be.visible')
      cy.contains('button', 'Review').click()
      cy.contains('Review route entry').should('be.visible')
      cy.contains('button', 'Finish route').click()
      cy.location('pathname').should('eq', '/supply')
      cy.contains('Supply route saved').should('be.visible')
      cy.contains('Guided Test Route').should('be.visible')
    })
  })

  it('opens a new receipt entry on the items step', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `INSERT INTO supply_routes (name, status) VALUES ('Journey Route ${suffix}', 'open') RETURNING id`,
    ).then((routeRows: Array<{ id: string }>) => {
      cy.visit(`/supply/${routeRows[0].id}/entry?step=items`)
      cy.waitForHydration()
      cy.contains('Receipts').should('be.visible')
      cy.contains('Step 2 of 4').should('be.visible')
      cy.get('[data-receipt-row="0"] input[aria-label="Item name"]').should(
        'be.visible',
      )
      cy.contains('Review route entry').should('not.exist')
    })
  })
})
