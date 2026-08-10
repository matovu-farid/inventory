describe('Top-level item entry', () => {
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
      `INSERT INTO items (article_number, name, category, cost_price, cost_currency)
       VALUES ('TOP-${suffix}', 'Top level item ${suffix}', 'General', '10', 'USD')`,
    )

    cy.visit('/items/new')
    cy.waitForHydration()
    cy.get('[aria-label="Search catalog items"]').type(`TOP-${suffix}`)
    cy.contains(`Top level item ${suffix}`).click()
    cy.location('pathname').should('eq', `/items/TOP-${suffix}`)
  })

  it('defaults the purchase supplier to a supplier on the current route', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `INSERT INTO suppliers (name, type) VALUES ('Catalog Supplier ${suffix}', 'international'), ('Route Supplier ${suffix}', 'international') RETURNING id`,
    ).then((supplierRows: Array<{ id: string }>) => {
      const catalogSupplierId = supplierRows[0].id
      const routeSupplierId = supplierRows[1].id
      cy.dbQuery(
        `INSERT INTO items (article_number, name, category, supplier_id, cost_price, cost_currency)
         VALUES ('SUP-${suffix}', 'Supplier default item ${suffix}', 'General', '${catalogSupplierId}', '10', 'USD') RETURNING id`,
      ).then(() => {
        cy.dbQuery(
          `INSERT INTO supply_routes (name, status) VALUES ('Supplier default route ${suffix}', 'open') RETURNING id`,
        ).then((routeRows: Array<{ id: string }>) => {
          const routeId = routeRows[0].id
          cy.dbQuery(
            `INSERT INTO supply_route_suppliers (supply_route_id, supplier_id) VALUES ('${routeId}', '${routeSupplierId}')`,
          )

          cy.visit(`/supply/${routeId}/entry`)
          cy.waitForHydration()
          cy.contains('Add items to this route').should('be.visible')
          cy.get('button[role="combobox"]')
            .first()
            .should('be.visible')
            .click({ force: true })
          cy.get('[role="option"]', { timeout: 20000 })
            .contains(`SUP-${suffix} — Supplier default item ${suffix}`)
            .should('be.visible')
            .click({ force: true })
          cy.get('[role="combobox"]')
            .eq(1)
            .should('contain', `Route Supplier ${suffix}`)
        })
      })
    })
  })
})
