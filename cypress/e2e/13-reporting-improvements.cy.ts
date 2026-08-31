describe('reporting improvements', () => {
  const admin = `e2e-reporting-${Date.now()}@test.com`
  const password = 'E2EPassword123!'

  before(() => {
    cy.task('cleanupAllTestData', null)
    cy.signup('Reporting Admin', admin, password)
    cy.task(
      'dbQuery',
      `UPDATE "user" SET role='admin', email_verified=TRUE WHERE email='${admin}'`,
    )
  })

  after(() => {
    cy.task('cleanupAllTestData', null)
  })

  beforeEach(() => {
    cy.loginAndCache(admin, password)
    cy.on('uncaught:exception', () => false)
  })

  it('renders the financial summary and report hub', () => {
    cy.visit('/reports')
    cy.contains('h1', 'Financial Reports').should('be.visible')
    cy.contains('button', 'Apply').should('be.visible')
    cy.contains('button', 'Print').should('be.visible')
    cy.contains('button', 'Export CSV').should('be.visible')
    cy.contains('Cash Position').should('be.visible')
    cy.contains('Income Statement').should('be.visible')
    cy.contains('Statement of Financial Position').should('be.visible')
    cy.contains('All Reports').should('be.visible')
    cy.contains('Financial Summary').should('be.visible')
    cy.contains('General Ledger').should('be.visible')
    cy.contains('X Report').should('be.visible')
    cy.contains('Z Reports').should('be.visible')
  })

  it('reproduces a selected period from the URL and clears it', () => {
    cy.visit('/reports?from=2026-08-01&to=2026-08-31')
    cy.contains('2026-08-01 to 2026-08-31').should('be.visible')
    cy.get('button').contains('Clear').click()
    cy.url().should('not.include', 'from=')
    cy.url().should('not.include', 'to=')
  })

  it('provides ledger totals and the visible-row limit context', () => {
    cy.visit('/reports/ledger?from=2026-08-01&to=2026-08-31')
    cy.contains('h1', 'General Ledger').should('be.visible')
    cy.contains('Latest 100 journal entries').should('be.visible')
    cy.contains('Showing 0 of up to 100 entries').should('be.visible')
    cy.contains('Total debits').should('be.visible')
    cy.contains('Total credits').should('be.visible')
    cy.contains('button', 'Export CSV').should('be.visible')
  })

  it('does not overflow at a mobile viewport', () => {
    cy.viewport(390, 844)
    cy.visit('/reports')
    cy.document().its('documentElement.scrollWidth').should('be.lte', 390)
    cy.visit('/reports/ledger')
    cy.document().its('documentElement.scrollWidth').should('be.lte', 390)
  })
})
