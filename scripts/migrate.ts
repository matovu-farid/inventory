import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })

try {
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('migrations applied')
} catch (err) {
  const e = err as { code?: string; detail?: string; hint?: string; message?: string; stack?: string }
  console.error('migration failed')
  console.error('code:', e.code)
  console.error('message:', e.message)
  if (e.detail) console.error('detail:', e.detail)
  if (e.hint) console.error('hint:', e.hint)
  if (e.stack) console.error(e.stack)
  process.exit(1)
} finally {
  await pool.end()
}
