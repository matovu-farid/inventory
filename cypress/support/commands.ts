/// <reference types="cypress" />

const ORIGIN = "http://localhost:3000"

/**
 * Sign up a test user via Better Auth API.
 */
Cypress.Commands.add("signup", (name: string, email: string, password: string) => {
  cy.request({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { Origin: ORIGIN },
    body: { name, email, password },
    failOnStatusCode: false,
  })
})

/**
 * Sign in and cache the session so it persists across tests.
 */
Cypress.Commands.add("loginAndCache", (email: string, password: string) => {
  cy.session(
    email,
    () => {
      cy.request({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { Origin: ORIGIN },
        body: { email, password },
      }).then((resp) => {
        expect(resp.status).to.eq(200)
      })
    },
    {
      validate() {
        cy.request({
          url: "/api/auth/get-session",
          headers: { Origin: ORIGIN },
          failOnStatusCode: false,
        }).its("status").should("eq", 200)
      },
    },
  )
})

Cypress.Commands.add("login", (email: string, password: string) => {
  cy.request({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { Origin: ORIGIN },
    body: { email, password },
  }).then((resp) => {
    expect(resp.status).to.eq(200)
  })
})

Cypress.Commands.add("dbQuery", (sql: string) => {
  cy.task("dbQuery", sql)
})

Cypress.Commands.add("cleanupTestUser", (email: string) => {
  cy.task("cleanupTestUser", email)
})

Cypress.Commands.add("cleanupAllTestData", () => {
  cy.task("cleanupAllTestData", null)
})

declare global {
  namespace Cypress {
    interface Chainable {
      signup(name: string, email: string, password: string): Chainable
      login(email: string, password: string): Chainable
      loginAndCache(email: string, password: string): Chainable
      dbQuery(sql: string): Chainable
      cleanupTestUser(email: string): Chainable
      cleanupAllTestData(): Chainable
    }
  }
}
