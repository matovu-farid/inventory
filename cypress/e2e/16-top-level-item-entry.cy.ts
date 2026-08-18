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

  it('defaults the purchase supplier to the item supplier', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `INSERT INTO suppliers (name, type) VALUES ('Catalog Supplier ${suffix}', 'international') RETURNING id`,
    ).then((supplierRows: Array<{ id: string }>) => {
      const catalogSupplierId = supplierRows[0].id
      cy.dbQuery(
        `INSERT INTO items (name, design, supplier_id, cost_price, cost_currency)
         VALUES ('Supplier default item ${suffix}', 'General', '${catalogSupplierId}', '10', 'USD') RETURNING id`,
      ).then((itemRows: Array<{ id: string }>) => {
        cy.dbQuery(
          `INSERT INTO item_article_numbers (item_id, article_number)
           VALUES ('${itemRows[0].id}', 'SUP-${suffix}')`,
        )
        cy.dbQuery(
          `INSERT INTO supply_routes (name, status) VALUES ('Supplier default route ${suffix}', 'open') RETURNING id`,
        ).then((routeRows: Array<{ id: string }>) => {
          const routeId = routeRows[0].id
          cy.visit(`/supply/${routeId}/entry`)
          cy.waitForHydration()
          cy.contains('Add items to this route').should('be.visible')
          cy.contains('h3', 'New item').should('be.visible')
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
            .should('contain', `Catalog Supplier ${suffix}`)
        })
      })
    })
  })

  it('keeps create and edit item fields inline on the route items step', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `INSERT INTO suppliers (name, type) VALUES ('Inline Supplier ${suffix}', 'international') RETURNING id`,
    ).then((supplierRows: Array<{ id: string }>) => {
      const itemSupplierId = supplierRows[0].id
      cy.dbQuery(
        `INSERT INTO items (name, description, design, supplier_id, cost_price, cost_currency, minimum_sell_price_ugx)
         VALUES ('Inline item ${suffix}', 'Inline item description ${suffix}', 'Inline design ${suffix}', '${itemSupplierId}', 'USD', '25000') RETURNING id`,
      ).then((itemRows: Array<{ id: string }>) => {
        cy.dbQuery(
          `INSERT INTO item_article_numbers (item_id, article_number)
           VALUES ('${itemRows[0].id}', 'INLINE-${suffix}')`,
        )
        cy.dbQuery(
          `INSERT INTO supply_routes (name, status) VALUES ('Inline editor route ${suffix}', 'open') RETURNING id`,
        ).then((routeRows: Array<{ id: string }>) => {
          const routeId = routeRows[0].id
          cy.visit(`/supply/${routeId}/entry`)
          cy.waitForHydration()
          cy.get('button[role="combobox"]').first().click({ force: true })
          cy.get('[role="option"]', { timeout: 20000 })
            .contains(`INLINE-${suffix} — Inline item ${suffix}`)
            .click({ force: true })

          cy.contains('button', 'Edit item').click()
          cy.contains('h3', 'Edit item details').should('be.visible')
          cy.get('[role="dialog"]').should('not.exist')
          cy.contains('button', 'Add Items').should('be.disabled')
          cy.get('input').should(($inputs) => {
            const values = [...$inputs].map((input) => input.value)
            expect(values).to.include(`Inline item ${suffix}`)
            expect(values).to.include(`INLINE-${suffix}`)
            expect(values).to.include('25000')
          })
          cy.get('textarea').should(
            'have.value',
            `Inline item description ${suffix}`,
          )

          cy.contains('button', 'Cancel').click()
          cy.contains('button', /^Create new item$/).click()
          cy.contains('h3', 'New item').should('be.visible')
          cy.contains('Current supplier').should('be.visible')
          cy.get('[role="dialog"]').should('not.exist')
          cy.contains('button', 'Add Items').should('be.disabled')
        })
      })
    })
  })
})
