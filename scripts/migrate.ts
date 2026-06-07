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
  console.error('migration failed')
  let cur: unknown = err
  let depth = 0
  while (cur && depth < 5) {
    const e = cur as {
      code?: string
      detail?: string
      hint?: string
      message?: string
      severity?: string
      where?: string
      stack?: string
      cause?: unknown
    }
    console.error(`--- error[${depth}] ---`)
    console.error('code:', e.code)
    console.error('severity:', e.severity)
    console.error('message:', e.message)
    if (e.detail) console.error('detail:', e.detail)
    if (e.hint) console.error('hint:', e.hint)
    if (e.where) console.error('where:', e.where)
    if (e.stack) console.error(e.stack)
    cur = e.cause
    depth++
  }
  process.exit(1)
} finally {
  await pool.end()
}
