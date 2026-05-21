/**
 * Product variants E2E smoke.
 *
 * Walks the happy path of the variant feature end-to-end:
 * 1. Log in as an admin.
 * 2. Create a supply route.
 * 3. Open Add Item, create a new product, add a color (with palette pick).
 * 4. Fill the variant grid and save.
 * 5. Verify the new variant row renders in the items table.
 *
 * S3 PUT calls are stubbed so the test doesn't require network egress —
 * the image upload path is exercised only if a color image is attached,
 * which this smoke skips for simplicity.
 *
 * If selectors drift as the UI evolves, update them here rather than
 * baking `data-testid` props into shipped components.
 */
describe("Product variants happy path", () => {
  const testEmail = `e2e-variants-${Date.now()}@test.com`
  const testPassword = "E2EPassword123!"

  before(() => {
    cy.task("cleanupAllTestData", null)
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: { name: "E2E Variants Admin", email: testEmail, password: testPassword },
    })
    cy.task(
      "dbQuery",
      `UPDATE "user" SET role = 'admin', email_verified = TRUE WHERE email = '${testEmail}'`,
    )
  })

  beforeEach(() => {
    cy.loginAndCache(testEmail, testPassword)
    cy.intercept("PUT", "https://*.s3.eu-west-1.amazonaws.com/**", {
      statusCode: 200,
    }).as("s3Put")
  })

  after(() => {
    cy.task("cleanupAllTestData", null)
  })

  it("creates a product, adds a color, and records a variant on a supply route", () => {
    // Prereq: at least one supplier exists. Use the seed or create one quickly.
    cy.task(
      "dbQuery",
      `INSERT INTO suppliers (name, type, country) VALUES ('E2E Supplier', 'international', 'CN')
       ON CONFLICT DO NOTHING`,
    )

    cy.visit("/supply")
    cy.contains("button", /new route|create.*route/i).should("be.visible")
    cy.wait(2000)
    cy.contains("button", /new route|create.*route/i).click()
    cy.get('[role="dialog"]', { timeout: 5000 }).should("be.visible")
    cy.get('[role="dialog"] input#name').clear().type("E2E Variant Route")
    cy.get('[role="dialog"]').contains("button", /create|save/i).click()
    cy.location("pathname", { timeout: 5000 }).should("match", /\/supply\/[\w-]+/)

    cy.contains("button", /add item/i).click()

    // Open Product picker, choose "Create new"
    cy.contains("button", /select product/i).click()
    cy.contains("Create new").click()

    // Fill ProductEditor
    cy.contains("label", "Article number").parent().find("input").type(`E2E-${Date.now()}`)
    cy.contains("label", "Product name").parent().find("input").type("E2E Crew Tee")
    cy.contains("button", /create product/i).click()

    // Add a Red color via the palette (no image — keeps test deterministic)
    cy.contains("button", /add color/i).click()
    cy.contains("button", "Red").click()
    cy.contains("button", /save color/i).click()

    // Fill quantity for the first cell
    cy.get('input[type="number"]').first().clear().type("3")

    // Enter unit price + rates
    cy.contains(/unit price/i).parent().find("input").type("45")
    cy.contains(/usd.*ugx|→ ugx/i)
      .parent()
      .find("input")
      .last()
      .type("3700")

    cy.contains("button", /save items/i).click()

    // Verify the variant row landed in the items table
    cy.contains("E2E Crew Tee", { timeout: 5000 }).should("exist")
    cy.contains(/Red.*\b(S|M|L)\b/).should("exist")
  })
})
