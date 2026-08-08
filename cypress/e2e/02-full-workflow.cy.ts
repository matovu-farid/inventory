/**
 * Full end-to-end workflow test.
 *
 * Uses cy.session() to persist auth across tests.
 * Waits for hydration before interacting with elements.
 */
// TODO: This 14-step happy-path spec was written against an earlier version
// of the UI and has drifted significantly — shops moved from /settings to
// /shop, supplier "country" is now a Combobox (not an <input>), the required
// "type" enum was added, supply-route detail "View" link copy changed, etc.
// The focused specs (04-customers, 05-receiving-prereqs, 07-product-variants,
// 09-mobile-admin-screens, 10-shift-reports) now cover the same surface area
// at finer grain. Skip this one until it can be rewritten.
describe.skip('Full Inventory Workflow', () => {
  const testEmail = `e2e-admin-${Date.now()}@test.com`
  const testPassword = 'E2EPassword123!'

  /** Wait for React hydration to complete before interacting */
  function waitForHydration() {
    // Wait for TanStack Start hydration — the __tsr script is removed after hydration
    cy.get('body', { timeout: 15000 }).should('be.visible')
    cy.wait(3500) // Allow React hydration + client-side routing to settle (CI is slow)
  }

  before(() => {
    cy.task('cleanupAllTestData', null)

    cy.request({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { Origin: 'http://localhost:3000' },
      body: { name: 'E2E Admin', email: testEmail, password: testPassword },
    })

    cy.task(
      'dbQuery',
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
  })

  after(() => {
    cy.task('cleanupAllTestData', null)
  })

  it('01 - loads the home page', () => {
    cy.visit('/')
    waitForHydration()
    cy.contains('Dashboard', { timeout: 10000 }).should('be.visible')
    cy.screenshot('01-home-page')
  })

  it('02 - creates a shop in settings', () => {
    cy.visit('/settings')
    waitForHydration()
    cy.contains('Settings').should('be.visible')
    cy.screenshot('02-settings-page')

    cy.get('button').contains('Add Shop').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

    cy.get('[role="dialog"]').within(() => {
      cy.get('input#name').type('Test Shop Kampala')
      cy.get('input#location').type('Kampala')
      cy.get('button').contains('Create Shop').click()
    })

    cy.contains('Test Shop Kampala', { timeout: 5000 }).should('be.visible')
    cy.screenshot('03-shop-created')
  })

  it('03 - creates a supplier', () => {
    cy.visit('/supply/suppliers')
    waitForHydration()
    cy.contains('Suppliers').should('be.visible')

    cy.get('button').contains('Add Supplier').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

    cy.get('[role="dialog"]').within(() => {
      cy.get('input#name').type('China Textiles Ltd')
      cy.get('input#country').type('China')
      cy.get('input#contactName').type('Mr. Zhang')
      cy.get('input#contactPhone').type('+86-555-0123')
      cy.get('button').contains('Create Supplier').click()
    })

    cy.contains('China Textiles Ltd', { timeout: 5000 }).should('be.visible')
    cy.screenshot('04-supplier-created')
  })

  it('04 - creates a supply route', () => {
    cy.visit('/supply')
    waitForHydration()
    cy.contains('Supply Routes').should('be.visible')

    cy.get('button').contains('New Route').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

    cy.get('[role="dialog"]').within(() => {
      cy.get('input#name').type('Test Route 47')
      cy.get('input#budgetUsd').type('5000')
    })
    // Supplier checkbox is inside dialog
    cy.get('[role="dialog"]').contains('China Textiles Ltd').click()
    cy.get('[role="dialog"]').within(() => {
      cy.get('button').contains('Create Route').click()
    })

    cy.contains('Test Route 47', { timeout: 5000 }).should('be.visible')
    cy.screenshot('05-supply-route-created')
  })

  it('05 - adds items and expenses to supply route', () => {
    // Insert test data via DB to bypass Radix Select form issues in Cypress
    cy.task(
      'dbQuery',
      `SELECT id FROM supply_routes WHERE name = 'Test Route 47' LIMIT 1`,
    ).then((rows: any) => {
      const routeId = rows[0].id
      cy.task(
        'dbQuery',
        `SELECT id FROM suppliers WHERE name = 'China Textiles Ltd' LIMIT 1`,
      ).then((supplierRows: any) => {
        const supplierId = supplierRows[0].id

        // Insert supply route item
        cy.task(
          'dbQuery',
          `INSERT INTO supply_route_lines (supply_route_id, supplier_id, product_name, quantity, unit_price_foreign, foreign_currency, exchange_rate_foreign_to_usd, exchange_rate_usd_to_ugx, total_amount_foreign, total_amount_usd, total_cost_ugx)
               VALUES ('${routeId}', '${supplierId}', 'Cotton T-Shirts', 100, '45.00', 'RMB', '7.200000', '3700.00', '4500.00', '625.00', '2312500.00')`,
        )

        // Insert supply route expense
        cy.task(
          'dbQuery',
          `INSERT INTO supply_route_expenses (supply_route_id, category, description, amount)
               VALUES ('${routeId}', 'freight', 'Container shipping', '500000.00')`,
        )

        // Verify on the route detail page
        cy.visit(`/supply/${routeId}`)
        waitForHydration()
        cy.contains('Cotton T-Shirts', { timeout: 5000 }).should('be.visible')
        cy.contains('Container shipping', { timeout: 5000 }).should(
          'be.visible',
        )
        cy.screenshot('06-items-and-expenses')
      })
    })
  })

  it('06 - keeps the route open until receiving completes', () => {
    cy.visit('/supply')
    waitForHydration()
    cy.get('a').contains('View').first().click()
    cy.contains('Test Route 47', { timeout: 10000 }).should('be.visible')
    waitForHydration()

    cy.contains('Open').should('be.visible')
    cy.screenshot('08-status-changed')
  })

  it('07 - receives goods at the store', () => {
    cy.visit('/store/receiving')
    waitForHydration()
    cy.contains('Receive Goods').should('be.visible')

    // Select route
    cy.get('main').find('button[role="combobox"]').first().click()
    cy.get('[role="option"]').first().click()

    cy.contains('Cotton T-Shirts', { timeout: 8000 }).should('be.visible')
    cy.screenshot('09-receiving-items')

    cy.get('button').contains('Confirm Receipt').click()
    cy.contains('Receipt Summary', { timeout: 8000 }).should('be.visible')
    cy.screenshot('10-goods-received')
  })

  it('08 - shows store stock', () => {
    cy.visit('/store')
    waitForHydration()
    cy.contains('Store Stock').should('be.visible')
    cy.contains('Cotton T-Shirts', { timeout: 5000 }).should('be.visible')
    cy.screenshot('11-store-stock')
  })

  it('09 - transfers goods to shop', () => {
    cy.visit('/store/transfers')
    waitForHydration()
    cy.contains('Store Transfers').should('be.visible')

    cy.get('button').contains('New Transfer').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

    // Select shop
    cy.get('[role="dialog"]').find('button[role="combobox"]').first().click()
    cy.get('[role="option"]').contains('Test Shop Kampala').click()
    // Select stock item
    cy.get('[role="dialog"]').within(() => {
      cy.get('input[type="checkbox"]').first().check()
      cy.get('button').contains('Dispatch').click()
    })
    cy.contains('dispatched', { timeout: 5000 }).should('be.visible')
    cy.screenshot('12-transfer-dispatched')
  })

  it('10 - confirms transfer receipt at shop', () => {
    cy.visit('/store/transfers')
    waitForHydration()
    cy.contains('Store Transfers').should('be.visible')

    cy.get('button').contains('Confirm Receipt').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
    cy.get('[role="dialog"]').within(() => {
      cy.get('button').contains('Confirm Receipt at Shop').click()
    })
    cy.contains('received', { timeout: 8000 }).should('be.visible')
    cy.screenshot('13-transfer-received')
  })

  it('11 - views shop stock and records a sale', () => {
    cy.visit('/shop')
    waitForHydration()
    cy.contains('Shop').should('be.visible')
    cy.contains('Cotton T-Shirts', { timeout: 10000 }).should('be.visible')
    cy.screenshot('14-shop-stock')

    cy.get('button').contains('New Sale').click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

    // Select item
    cy.get('[role="dialog"]').find('button[role="combobox"]').first().click()
    cy.get('[role="option"]').first().click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input[type="number"]').first().clear().type('5')
      cy.get('button').contains('Record Sale').click()
    })
    cy.get('[role="dialog"]').should('not.exist')
    cy.screenshot('15-sale-recorded')
  })

  it('12 - views sales history', () => {
    cy.visit('/shop/sales')
    waitForHydration()
    cy.contains('Sales History').should('be.visible')
    cy.screenshot('16-sales-history')
  })

  it('13 - views financial reports', () => {
    cy.visit('/reports')
    waitForHydration()
    cy.contains('Financial Reports').should('be.visible')
    cy.contains('Net Income').should('be.visible')
    cy.screenshot('17-financial-reports')
  })

  it('14 - views general ledger with entries', () => {
    cy.visit('/reports/ledger')
    waitForHydration()
    cy.contains('General Ledger').should('be.visible')
    cy.get('table tbody tr', { timeout: 5000 }).should(
      'have.length.greaterThan',
      0,
    )
    cy.screenshot('18-general-ledger')
  })
})
