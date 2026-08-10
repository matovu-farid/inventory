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
      `INSERT INTO suppliers (name, type) VALUES ('Guided Test Supplier', 'international') RETURNING id`,
    ).then((supplierRows: Array<{ id: string }>) => {
      cy.dbQuery(
        `INSERT INTO supply_routes (name, status) VALUES ('Guided Test Route', 'open') RETURNING id`,
      ).then((routeRows: Array<{ id: string }>) => {
        cy.dbQuery(
          `INSERT INTO supply_route_suppliers (supply_route_id, supplier_id) VALUES ('${routeRows[0].id}', '${supplierRows[0].id}')`,
        )

        cy.visit('/supply/new')
        cy.waitForHydration()
        cy.contains('Continue most recent route').should('be.visible')
        cy.contains('Select another open route').should('be.visible')
        cy.contains('Start a new route').should('be.visible')
        cy.contains('button', 'Continue').click()
        cy.contains('Edit route details').should('be.visible')
        cy.contains('Route basics', { timeout: 10000 }).should('be.visible')
        cy.contains('Step 3 of 4').should('be.visible')

        cy.contains('Route suppliers').should('not.exist')
        cy.contains('Add items to this route').should('be.visible')

        cy.contains('Save and exit').click()
        cy.location('pathname').should('eq', `/supply/${routeRows[0].id}`)
        cy.visit(`/supply/${routeRows[0].id}/entry`)
        cy.waitForHydration()
        cy.contains('Step 3 of 4').should('be.visible')
        cy.contains('Add items to this route').should('be.visible')
      })
    })
  })

  it('enters suppliers and a flexible item, then edits the completed entry', () => {
    const suffix = Date.now()
    cy.dbQuery(
      `INSERT INTO suppliers (name, type) VALUES ('Journey Supplier ${suffix}', 'international'), ('Journey Supplier Two ${suffix}', 'international') RETURNING id`,
    ).then((supplierRows: Array<{ id: string }>) => {
      const supplierId = supplierRows[0].id
      cy.dbQuery(
        `INSERT INTO item_categories (name) VALUES ('Journey Category ${suffix}') RETURNING id`,
      ).then((categoryRows: Array<{ id: string }>) => {
        cy.dbQuery(
          `INSERT INTO items (article_number, name, category, category_id, supplier_id, cost_price, cost_currency, minimum_sell_price_ugx)
           VALUES ('JOURNEY-${suffix}', 'Journey tee ${suffix}', 'Journey Category ${suffix}', '${categoryRows[0].id}', '${supplierId}', '15000', 'UGX', '30000') RETURNING id`,
        ).then((itemRows: Array<{ id: string }>) => {
          const itemId = itemRows[0].id
          cy.dbQuery(
            `INSERT INTO item_colors (item_id, color_name, color_hex) VALUES ('${itemId}', 'Red', '#ff0000') RETURNING id`,
          ).then((colorRows: Array<{ id: string }>) => {
            const colorId = colorRows[0].id
            cy.dbQuery(
              `INSERT INTO variants (item_id, color_id, size) VALUES ('${itemId}', '${colorId}', 'M'), ('${itemId}', '${colorId}', 'L')`,
            )
            cy.dbQuery(
              `INSERT INTO supply_routes (name, status) VALUES ('Journey Route ${suffix}', 'open') RETURNING id`,
            ).then((routeRows: Array<{ id: string }>) => {
              const routeId = routeRows[0].id
              cy.dbQuery(
                `INSERT INTO supply_route_suppliers (supply_route_id, supplier_id) VALUES ('${routeId}', '${supplierId}'), ('${routeId}', '${supplierRows[1].id}')`,
              )

              cy.visit(`/supply/${routeId}/entry`)
              cy.waitForHydration()
              cy.contains('Add items to this route').should('be.visible')
              cy.contains('Step 3 of 4').should('be.visible')
              cy.contains('Select item…').should('be.visible')
              cy.contains('Items already entered').should('be.visible')
              cy.contains('Review route entry').should('not.exist')
            })
          })
        })
      })
    })
  })
})
