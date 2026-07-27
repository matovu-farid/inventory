/**
 * X/Z shift reports: admin sees totals, closes a shift, sees Z #1.
 *
 * Inserts sales directly via SQL because the full POS flow has a known
 * Cypress hydration issue (see 08-mobile-pos.cy.ts). The point here is
 * to verify the reports endpoint + close-shift flow, not POS UX.
 */
describe('X/Z shift reports', () => {
  const admin = `e2e-zreport-${Date.now()}@test.com`
  const password = 'E2EPassword123!'
  const shopName = `Z-Shop-${Date.now()}`

  before(() => {
    cy.task('cleanupAllTestData', null)
    cy.signup('Z Admin', admin, password)
    cy.task(
      'dbQuery',
      `UPDATE "user" SET role='admin', email_verified=TRUE WHERE email='${admin}'`,
    )
    cy.task(
      'dbQuery',
      `INSERT INTO shops (name, location) VALUES ('${shopName}', 'Kampala') ON CONFLICT DO NOTHING`,
    )
    cy.task(
      'dbQuery',
      `INSERT INTO shop_sales (shop_id, sale_date, sold_by, payment_method, total_amount, payment_status, outstanding_balance)
       SELECT (SELECT id FROM shops WHERE name='${shopName}'), NOW(), (SELECT id FROM "user" WHERE email='${admin}'),
              'cash'::payment_method, '50000', 'settled'::payment_status, '0'`,
    )
    cy.task(
      'dbQuery',
      `INSERT INTO shop_sales (shop_id, sale_date, sold_by, payment_method, total_amount, payment_status, outstanding_balance)
       SELECT (SELECT id FROM shops WHERE name='${shopName}'), NOW(), (SELECT id FROM "user" WHERE email='${admin}'),
              'bank'::payment_method, '20000', 'settled'::payment_status, '0'`,
    )
  })

  after(() => {
    cy.task('cleanupAllTestData', null)
  })

  beforeEach(() => {
    cy.loginAndCache(admin, password)
    cy.on('uncaught:exception', () => false)
  })

  it('X report shows aggregated totals', () => {
    cy.visit('/reports/x')
    // Cash KPI = 50,000 UGX; Gross KPI = 70,000 UGX
    cy.contains(/70,000\s*UGX/).should('exist')
    cy.contains(/50,000\s*UGX/).should('exist')
  })

  it('closing a Z persists a shift_closures row', () => {
    cy.task('dbQuery', `DELETE FROM shift_closures`).then(() => {
      cy.visit('/reports/x')
      // Scope to the main heading — the sidebar nav also says "X Report".
      cy.get('h1').contains('X Report', { timeout: 10000 }).should('be.visible')
      cy.contains('button', 'Close shift (Z)').should('be.visible')
      cy.wait(3500)
      cy.contains('button', 'Close shift (Z)').click()
      cy.get('[role="dialog"]', { timeout: 10000 }).should('be.visible')
      cy.get('[role="dialog"] #declared').type('50000')
      cy.get('[role="dialog"]').contains('button', 'Close shift').click()
      // Wait for the request to round-trip
      cy.wait(1000)
      cy.task(
        'dbQuery',
        `SELECT closure_number FROM shift_closures
           WHERE shop_id=(SELECT id FROM shops WHERE name='${shopName}')`,
      ).then((rows: unknown) => {
        const r = rows as Array<{ closure_number: number }>
        expect(r.length, 'shift_closures row inserted').to.be.greaterThan(0)
        expect(r[0].closure_number).to.eq(1)
      })
    })
  })
})
