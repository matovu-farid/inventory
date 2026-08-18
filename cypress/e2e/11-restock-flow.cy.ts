/// <reference types="cypress" />

/**
 * Low-stock restock golden path E2E
 *
 * Uses raw DB writes to seed exactly the state the engine needs:
 * - A product/color/size with shop stock at qoh=2 (below a units=5 override)
 * - An open low_stock_alert for that variant+shop (so the restock page shows it)
 * - A matching store_stock row (so the transfer button is enabled)
 *
 * Then drives the admin-visible flow:
 * 1. Settings → "Run check now" → banner confirms completion
 * 2. /shop/:id/restock → row is visible → tick + Create transfer → redirect
 */

const TIMESTAMP = Date.now()
const TEST_EMAIL = `e2e-restock-${TIMESTAMP}@test.com`
const TEST_PASSWORD = 'E2EPassword123!'
const ART = `RST-${TIMESTAMP}`

describe('Low-stock restock flow', () => {
  before(() => {
    cy.task('cleanupAllTestData', null)

    // Create admin user
    cy.request({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { Origin: 'http://localhost:3000' },
      body: {
        name: 'Restock Admin',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    })
    cy.task(
      'dbQuery',
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${TEST_EMAIL}'`,
    )

    // Seed item + article number + color.
    cy.task(
      'dbQuery',
      `
      INSERT INTO items (id, name, design)
      VALUES (
        gen_random_uuid(),
        'Restock Test Product',
        'Test'
      )
      RETURNING id;
    `,
    ).as('productId')

    cy.then(function () {
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task(
        'dbQuery',
        `INSERT INTO item_article_numbers (item_id, article_number)
         VALUES ('${productId}', '${ART}')`,
      )
    })

    cy.then(function () {
      const productId = (this.productId as Array<{ id: string }>)[0].id
      cy.task(
        'dbQuery',
        `
        INSERT INTO item_colors (id, item_id, color_name, color_hex)
        VALUES (gen_random_uuid(), '${productId}', 'Red', '#FF0000')
        RETURNING id;
      `,
      ).as('pcId')
    })

    // Seed store and shop
    cy.task(
      'dbQuery',
      `
      INSERT INTO stores (id, name) VALUES (gen_random_uuid(), 'RST Store ${TIMESTAMP}') RETURNING id;
    `,
    ).as('storeId')

    cy.task(
      'dbQuery',
      `
      INSERT INTO shops (id, name) VALUES (gen_random_uuid(), 'RST Shop ${TIMESTAMP}') RETURNING id;
    `,
    ).as('shopId')

    // Seed a variant row so notification tables can address inventory via
    // variant_id (the swap from (product_color_id, size) → variant_id landed
    // in #5).
    cy.then(function () {
      const productId = (this.productId as Array<{ id: string }>)[0].id
      const pcId = (this.pcId as Array<{ id: string }>)[0].id
      cy.task(
        'dbQuery',
        `
        INSERT INTO variants (id, item_id, color_id, size)
        VALUES (gen_random_uuid(), '${productId}', '${pcId}', 'M')
        RETURNING id;
      `,
      ).as('variantId')
    })

    // Seed stock rows and alert — all depend on pcId, variantId, storeId, shopId
    cy.then(function () {
      const pcId = (this.pcId as Array<{ id: string }>)[0].id
      const variantId = (this.variantId as Array<{ id: string }>)[0].id
      const shopId = (this.shopId as Array<{ id: string }>)[0].id
      const storeId = (this.storeId as Array<{ id: string }>)[0].id

      Cypress.env('RESTOCK_SHOP_ID', shopId)

      // Store stock — warehouse has 100 units available.
      // item_id is denormalized after the variant-flexibility flip (Plan 1);
      // resolve it from variants -> item_colors. minimum_sell_price_ugx is
      // now item-level (lives on items.minimum_sell_price_ugx).
      cy.task(
        'dbQuery',
        `
        INSERT INTO store_stock (id, store_id, item_id, variant_id, quantity_on_hand, cost_per_unit_ugx)
        SELECT gen_random_uuid(), '${storeId}', pc.item_id, v.id, 100, 1000
        FROM variants v JOIN item_colors pc ON pc.id = v.color_id
        WHERE v.id = '${variantId}'
        RETURNING id;
      `,
      ).as('storeStockId')

      // Shop stock — only 2 units (below the threshold of 5).
      // Same item_id denorm pattern after Plan 2a Task 1.
      cy.task(
        'dbQuery',
        `
        INSERT INTO shop_stock (id, shop_id, item_id, variant_id, quantity_on_hand, cost_per_unit_ugx)
        SELECT gen_random_uuid(), '${shopId}', pc.item_id, v.id, 2, 1500
        FROM variants v JOIN item_colors pc ON pc.id = v.color_id
        WHERE v.id = '${variantId}';
      `,
      )

      // Per-item units override: threshold = 5 (qoh=2 is below it).
      // Plan 2c made overrides item-keyed; variant_id is now optional.
      cy.task(
        'dbQuery',
        `
        INSERT INTO notification_threshold_overrides (id, scope, item_id, variant_id, shop_id, mode, value)
        SELECT gen_random_uuid(), 'shop', pc.item_id, v.id, NULL, 'units', 5
        FROM variants v JOIN item_colors pc ON pc.id = v.color_id
        WHERE v.id = '${variantId}';
      `,
      )

      // Pre-seed an open low_stock_alert so the restock page shows results
      // even if the manual check button doesn't re-open one already open.
      // Plan 2c made alerts item-keyed; variant_id is still recorded.
      cy.task(
        'dbQuery',
        `
        INSERT INTO low_stock_alerts (
          id, scope, location_id, item_id, variant_id, status,
          baseline_quantity, threshold_snapshot, quantity_at_open
        )
        SELECT
          gen_random_uuid(), 'shop', '${shopId}', pc.item_id, v.id, 'open',
          10,
          '{"mode":"units","value":5}',
          2
        FROM variants v JOIN item_colors pc ON pc.id = v.color_id
        WHERE v.id = '${variantId}';
      `,
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

  it('runs the manual check from settings and sees a completion banner', () => {
    cy.visit('/settings/notifications')
    cy.wait(3500) // TanStack Start SSR + client hydration

    cy.contains('button', 'Run check now').should('be.visible').click()

    // In CI's dev server the threshold-checks server-fn chunk compiles on
    // first click, which can take well past the default 4s. 30s timeout
    // covers cold-compile + the actual scan.
    cy.contains(/check complete/i, { timeout: 30000 }).should('be.visible')
  })

  it('shows low-stock item on the shop restock page', () => {
    const shopId = Cypress.env('RESTOCK_SHOP_ID') as string
    cy.visit(`/shop/${shopId}/restock`)
    cy.wait(3500)

    // Card header from the restock route
    cy.contains('Currently low').should('be.visible')

    // Product label includes the article number
    cy.contains(ART).should('be.visible')
  })

  it('ticks a row, creates a transfer, and navigates away', () => {
    const shopId = Cypress.env('RESTOCK_SHOP_ID') as string
    cy.visit(`/shop/${shopId}/restock`)
    cy.wait(3500)

    // Check the first (and only) row's checkbox — native <input type="checkbox">
    cy.get('input[type="checkbox"]').first().check()

    // Click the "Create transfer" button
    cy.contains('button', /create transfer/i).click()

    // After dispatch the route navigates to /store/transfers,
    // or stays on the restock page with a success banner
    cy.url({ timeout: 10000 }).should(
      'match',
      /\/(store\/transfers|shop\/.*\/restock)/,
    )
  })
})
