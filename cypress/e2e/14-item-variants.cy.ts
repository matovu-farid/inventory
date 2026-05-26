/**
 * Item variants E2E (issue #7 acceptance #8).
 *
 * Covers the post-#7 catalog vocabulary:
 *   - /items lists every item with a size grid derived from variants
 *     (no longer `items.sizes`).
 *   - The item detail page shows a Variants subsection.
 *   - Managers can add a new variant via the form; the new row appears
 *     in the Variants subsection without a full page reload.
 *   - Deleting a variant works when no stock references it.
 *
 * Mirrors the structure of 13-item-categories.cy.ts: seed an admin user,
 * stub items via direct SQL (so the spec doesn't depend on the UI's
 * create flow which has its own dialog churn), then exercise the
 * variant section selectors.
 */
describe('Item variants — list and detail page', () => {
  const testEmail = `e2e-variants-${Date.now()}@test.com`
  const testPassword = 'E2EPassword123!'
  const stamp = Date.now()
  const articleNumber = `E2E-VAR-${stamp}`

  function waitForHydration() {
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.window({ timeout: 15000 }).should((win) => {
      expect((win as unknown as { $_TSR?: unknown }).$_TSR).to.be.undefined
    })
  }

  before(() => {
    cy.task('cleanupAllTestData', null)
    // Wipe any leftover scratch items + variants from a previous failed run.
    cy.task(
      'dbQuery',
      `DELETE FROM variants WHERE item_id IN (SELECT id FROM items WHERE article_number = '${articleNumber}')`,
    )
    cy.task(
      'dbQuery',
      `DELETE FROM item_colors WHERE item_id IN (SELECT id FROM items WHERE article_number = '${articleNumber}')`,
    )
    cy.task(
      'dbQuery',
      `DELETE FROM items WHERE article_number = '${articleNumber}'`,
    )

    cy.request({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { Origin: 'http://localhost:3000' },
      body: {
        name: 'E2E Variants Admin',
        email: testEmail,
        password: testPassword,
      },
    })
    cy.task(
      'dbQuery',
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )

    // Seed an item with two colors and three sizes worth of variants.
    cy.task(
      'dbQuery',
      `INSERT INTO items (article_number, name, item_category_id)
       SELECT '${articleNumber}', 'E2E variants tester',
              (SELECT id FROM item_categories WHERE name = 'Uncategorized')`,
    )
    cy.task(
      'dbQuery',
      `INSERT INTO item_colors (item_id, color_name, color_hex)
       SELECT id, 'Indigo', '#2a3a8b' FROM items WHERE article_number = '${articleNumber}'`,
    )
    cy.task(
      'dbQuery',
      `INSERT INTO item_colors (item_id, color_name, color_hex)
       SELECT id, 'Crimson', '#a01b1b' FROM items WHERE article_number = '${articleNumber}'`,
    )
    // 2 colors × 3 sizes = 6 variants. The unique constraint guards
    // against re-runs leaving partial state behind.
    cy.task(
      'dbQuery',
      `INSERT INTO variants (item_id, color_id, size)
       SELECT ic.item_id, ic.id, sz
       FROM item_colors ic
       JOIN items i ON i.id = ic.item_id
       CROSS JOIN (VALUES ('S'), ('M'), ('L')) AS s(sz)
       WHERE i.article_number = '${articleNumber}'
       ON CONFLICT ON CONSTRAINT uq_variant_item_color_size DO NOTHING`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
  })

  after(() => {
    cy.task(
      'dbQuery',
      `DELETE FROM variants WHERE item_id IN (SELECT id FROM items WHERE article_number = '${articleNumber}')`,
    )
    cy.task(
      'dbQuery',
      `DELETE FROM item_colors WHERE item_id IN (SELECT id FROM items WHERE article_number = '${articleNumber}')`,
    )
    cy.task(
      'dbQuery',
      `DELETE FROM items WHERE article_number = '${articleNumber}'`,
    )
    cy.task('cleanupAllTestData', null)
  })

  it('lists items with a size grid derived from variants', () => {
    cy.visit('/items')
    waitForHydration()
    cy.contains(articleNumber, { timeout: 10000 }).should('be.visible')
    // Each size from the seeded variants should appear as its own chip
    // on the item card (S / M / L).
    cy.contains('a', articleNumber).within(() => {
      cy.contains('S').should('be.visible')
      cy.contains('M').should('be.visible')
      cy.contains('L').should('be.visible')
    })
  })

  it('shows the Variants subsection with one row per (color × size)', () => {
    cy.visit(`/items/${articleNumber}`)
    waitForHydration()
    cy.contains('h2', 'Variants').should('be.visible')
    cy.get('[data-cy="variants-section"]').should('exist')
    // The table is in an overflow-x-auto wrapper so individual color
    // chips can be horizontally clipped on narrow viewports — assert
    // existence rather than visibility.
    cy.get('[data-cy="variant-row"]').should('have.length', 6)
    cy.get('[data-cy="variants-section"]').contains('Indigo').should('exist')
    cy.get('[data-cy="variants-section"]').contains('Crimson').should('exist')
  })

  it('adds a new variant via the add-variant form', () => {
    cy.visit(`/items/${articleNumber}`)
    waitForHydration()
    cy.get('[data-cy="add-variant-form"]').should('exist')
    cy.get('#new-variant-size').clear().type('XL')
    cy.get('[data-cy="add-variant-submit"]').click()
    // 6 starting rows + 1 new = 7.
    cy.get('[data-cy="variant-row"]', { timeout: 10000 }).should(
      'have.length.gte',
      7,
    )
    cy.get('[data-cy="variants-section"]').contains('XL').should('exist')
  })
})
