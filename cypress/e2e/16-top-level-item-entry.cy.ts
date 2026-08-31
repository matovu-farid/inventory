describe('Top-level item chooser', () => {
  const testEmail = `top-level-item-${Date.now()}@test.com`
  const testPassword = 'TopLevelItemPassword123!'

  before(() => {
    cy.cleanupAllTestData()
    cy.signup('Top Level Item Admin', testEmail, testPassword)
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

  it('opens the create-or-select page from the Items catalog', () => {
    cy.visit('/items')
    cy.waitForHydration()
    cy.contains('a', 'Create item').click()
    cy.location('pathname').should('eq', '/items/new')
    cy.waitForHydration()
    cy.contains('Select an existing item').should('be.visible')
    cy.get('button')
      .contains(/^Create new item$/)
      .should('be.visible')
      .and('be.enabled')
      .click({ force: true })
    cy.contains('Current supplier').should('be.visible')
    cy.contains('Item name').should('be.visible')
  })

  it('opens an existing item from the chooser search', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `WITH new_item AS (
         INSERT INTO items (name, design, cost_price, cost_currency)
         VALUES ('Top level item ${suffix}', 'General', '10', 'USD')
         RETURNING id
       )
       INSERT INTO item_article_numbers (item_id, article_number)
       SELECT id, 'TOP-${suffix}' FROM new_item`,
    )

    cy.visit('/items/new')
    cy.waitForHydration()
    cy.get('[aria-label="Search catalog items"]').type(`TOP-${suffix}`)
    cy.contains(`Top level item ${suffix}`).click()
    cy.location('pathname').should('eq', `/items/TOP-${suffix}`)
  })
})
