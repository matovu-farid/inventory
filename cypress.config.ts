import { defineConfig } from 'cypress'
import pg from 'pg'
import { cleanupAllTestData } from './cypress/support/cleanup'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    screenshotOnRunFailure: true,
    video: false,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    viewportWidth: 1280,
    viewportHeight: 800,
    setupNodeEvents(on) {
      const pool = new pg.Pool({
        connectionString:
          process.env.DATABASE_URL ??
          'postgresql://faridmatovu:alphanew90@127.0.0.1:5432/inventory',
      })

      on('task', {
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
            await client.query(`DELETE FROM session WHERE user_id = $1`, [
              userId,
            ])
            await client.query(`DELETE FROM account WHERE user_id = $1`, [
              userId,
            ])
            await client.query(`DELETE FROM "user" WHERE id = $1`, [userId])
            return { deleted: true, userId }
          } finally {
            client.release()
          }
        },

        async cleanupAllTestData(_: unknown) {
          // TRUNCATE deadlocks against in-flight server transactions when the
          // CI runner is slow enough that a test's writes are still settling.
          // Retry on Postgres deadlock (40P01) with backoff; surface the full
          // pg detail on final failure so the next bug is debuggable.
          const maxAttempts = 5
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const client = await pool.connect()
            try {
              await cleanupAllTestData(client)
              return { cleaned: true, attempts: attempt }
            } catch (err) {
              const pgErr = err as { code?: string; detail?: string; message?: string }
              if (pgErr.code === '40P01' && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 250 * attempt))
                continue
              }
              throw new Error(
                `cleanupAllTestData failed (attempt ${attempt}/${maxAttempts}, code=${pgErr.code}): ${pgErr.message}${pgErr.detail ? ` | detail: ${pgErr.detail}` : ''}`,
              )
            } finally {
              client.release()
            }
          }
          return { cleaned: false, attempts: maxAttempts }
        },
      })
    },
  },
})
