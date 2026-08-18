/// <reference types="cypress" />

/**
 * Backdated-receipt audit log golden path E2E
 *
 * Seeds the minimum state needed to drive the receiving form:
 * - admin user, store (defensive insert), supplier, supply_route (open,
 *   departed 2026-04-01), product + color + supply_route_item.
 *
 * Drives the admin-visible flow:
 * 1. /store/receiving → auto-selects the lone seeded route → sets the date
 *    picker to 2026-04-10 → submits.
 * 2. /settings/audit-log → filters by article number → row visible.
 * 3. /items/${ART} → Activity panel shows the row.
 */

const TIMESTAMP = Date.now()
const TEST_EMAIL = `e2e-audit-${TIMESTAMP}@test.com`
const TEST_PASSWORD = 'E2EPassword123!'
const ART = `AUD-${TIMESTAMP}`
const SUPPLIER_NAME = `Supplier Audit ${TIMESTAMP}`
const ROUTE_NAME = `Audit Route ${TIMESTAMP}`
const STORE_NAME = `AUD Store ${TIMESTAMP}`

describe('Backdated receipt audit log', () => {
  before(() => {
    cy.task('cleanupAllTestData', null)

    // Create admin user
    cy.request({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { Origin: 'http://localhost:3000' },
      body: { name: 'Audit Admin', email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    cy.task(
      'dbQuery',
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${TEST_EMAIL}'`,
    )

    // Ensure at least one store exists (idempotent — cleanup wipes stores)
    cy.task(
      'dbQuery',
      `INSERT INTO stores (id, name) VALUES (gen_random_uuid(), '${STORE_NAME}')`,
    )

    cy.task(
      'dbQuery',
      `INSERT INTO suppliers (id, name, type) VALUES (gen_random_uuid(), '${SUPPLIER_NAME}', 'international') RETURNING id;`,
    ).as('supplierId')

    cy.task(
      'dbQuery',
      `WITH new_item AS (
         INSERT INTO items (id, name, design)
         VALUES (gen_random_uuid(), 'Audit Test Product', 'Test')
         RETURNING id
       )
       INSERT INTO item_article_numbers (item_id, article_number)
       SELECT id, '${ART}' FROM new_item
       RETURNING item_id AS id;`,
    ).as('productId')

    cy.then(function () {
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task(
        'dbQuery',
        `INSERT INTO item_colors (id, item_id, color_name, color_hex) VALUES (gen_random_uuid(), '${productId}', 'Black', '#000000') RETURNING id;`,
      ).as('pcId')
    })

    cy.task(
      'dbQuery',
      `INSERT INTO supply_routes (id, name, status, departure_date) VALUES (gen_random_uuid(), '${ROUTE_NAME}', 'open', '2026-04-01') RETURNING id;`,
    ).as('routeId')

    cy.then(function () {
      const supplierId = (this.supplierId as Array<{ id: string }>)[0].id
      const routeId = (this.routeId as Array<{ id: string }>)[0].id
      const pcId = (this.pcId as Array<{ id: string }>)[0].id
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task(
        'dbQuery',
        `INSERT INTO supply_route_lines
          (id, supply_route_id, supplier_id, item_id, color_id, size, quantity, unit_price_foreign, total_amount_foreign, total_cost_ugx)
          VALUES (gen_random_uuid(), '${routeId}', '${supplierId}', '${productId}', '${pcId}', 'M', 10, '10', '100', '1000');`,
      )
      // The receive handler now resolves (color, size) → variant_id before
      // inserting store_stock (issue #4). Seed the matching variant so the
      // backdated-receipt flow can land its stock row.
      cy.task(
        'dbQuery',
        `INSERT INTO variants (item_id, color_id, size)
          VALUES ('${productId}', '${pcId}', 'M')
          ON CONFLICT DO NOTHING;`,
      )
    })
  })

  beforeEach(() => {
    cy.loginAndCache(TEST_EMAIL, TEST_PASSWORD)
    // Suppress hydration errors that don't affect the flow
    cy.on('uncaught:exception', () => false)
  })

  after(() => {
    cy.task('cleanupAllTestData', null)
  })

  it('admin backdates a receipt and the row appears on both audit views', () => {
    cy.visit('/store/receiving')
    cy.wait(3500) // TanStack Start SSR + client hydration

    // With a single receivable route the page auto-loads its items. Wait for
    // the items table by looking for the article number we seeded.
    cy.contains(ART, { timeout: 10000 }).should('be.visible')

    // Backdate the receipt to 2026-04-10 (after departure 2026-04-01, before
    // today, satisfies the `max={todayLocal}` constraint).
    cy.get('input[type="date"]').first().clear().type('2026-04-10')

    // The received qty is pre-filled to match expected, so just submit.
    cy.contains('button', /confirm receipt/i).click()

    // After submit the form navigates to /store.
    cy.url({ timeout: 10000 }).should('include', '/store')

    // Step 2 — global audit log: filter by article, see the row.
    cy.visit('/settings/audit-log')
    cy.wait(3500)

    cy.get('input[placeholder*="CB-1234"]').type(ART)
    cy.contains('button', /apply filters/i).click()
    cy.wait(1000)

    cy.contains('Received goods').should('be.visible')
    cy.contains('2026-04-10').should('be.visible')

    // Step 3 — product detail Activity panel.
    cy.visit(`/items/${ART}`)
    cy.wait(3500)

    // The Activity h2 may be below the fold; assert presence in DOM rather
    // than visibility (Cypress visibility check treats clipped elements as
    // hidden even when they're scrolled into view on demand).
    cy.contains('h2', 'Activity').should('exist')
    // Within the activity section, the receive-goods row should be rendered
    // (action label "Received goods") with the backdated business date.
    cy.contains('Received goods').should('exist')
    cy.contains('2026-04-10').should('exist')
  })
})
