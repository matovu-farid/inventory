import { defineConfig } from "cypress"
import pg from "pg"

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    screenshotOnRunFailure: true,
    video: false,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    viewportWidth: 1280,
    viewportHeight: 800,
    setupNodeEvents(on) {
      const pool = new pg.Pool({
        connectionString:
          "postgresql://faridmatovu:alphanew90@127.0.0.1:5432/inventory",
      })

      on("task", {
        async dbQuery(sql: string) {
          const client = await pool.connect()
          try {
            const result = await client.query(sql)
            return result.rows
          } finally {
            client.release()
          }
        },

        async cleanupTestUser(email: string) {
          const client = await pool.connect()
          try {
            // Get user ID
            const userRes = await client.query(
              `SELECT id FROM "user" WHERE email = $1`,
              [email],
            )
            if (userRes.rows.length === 0) return null

            const userId = userRes.rows[0].id

            // Delete in dependency order
            await client.query(`DELETE FROM session WHERE user_id = $1`, [userId])
            await client.query(`DELETE FROM account WHERE user_id = $1`, [userId])
            await client.query(`DELETE FROM "user" WHERE id = $1`, [userId])
            return { deleted: true, userId }
          } finally {
            client.release()
          }
        },

        async cleanupAllTestData(_: unknown) {
          const client = await pool.connect()
          try {
            // Delete in reverse dependency order
            await client.query(`DELETE FROM transactions`)
            await client.query(`DELETE FROM stock_take_items`)
            await client.query(`DELETE FROM stock_takes`)
            await client.query(`DELETE FROM shop_sale_items`)
            await client.query(`DELETE FROM shop_sales`)
            await client.query(`DELETE FROM location_expenses`)
            await client.query(`DELETE FROM shop_stock`)
            await client.query(`DELETE FROM store_transfer_items`)
            await client.query(`DELETE FROM store_transfers`)
            await client.query(`DELETE FROM store_receivings`)
            await client.query(`DELETE FROM store_stock`)
            await client.query(`DELETE FROM supply_route_expenses`)
            await client.query(`DELETE FROM supply_route_items`)
            await client.query(`DELETE FROM supply_route_suppliers`)
            await client.query(`DELETE FROM supply_routes`)
            await client.query(`DELETE FROM suppliers`)
            await client.query(`DELETE FROM shops`)
            await client.query(`DELETE FROM stores`)
            await client.query(`DELETE FROM session`)
            await client.query(`DELETE FROM account`)
            await client.query(`DELETE FROM verification`)
            await client.query(`DELETE FROM "user"`)
            return { cleaned: true }
          } finally {
            client.release()
          }
        },
      })
    },
  },
})
