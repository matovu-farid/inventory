import pg from 'pg'
import { db } from '../src/db/index.ts'
import { supplyRoutes } from '../src/db/schema/supply-routes.ts'
import { eq } from 'drizzle-orm'

async function main() {
  try {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'supply%' ORDER BY 1",
    )
    console.log('tables:', tables.rows.map((x) => x.table_name).join(', '))
    await pool.end()

    const rows = await db.query.supplyRoutes.findMany({
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      with: {
        items: { with: { itemColor: { with: { item: true } } } },
        suppliers: { with: { supplier: true } },
        expenses: true,
      },
    })
    console.log('list query ok', rows.length, rows.map((r) => r.name).join(', '))

    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: `Debug Route ${Date.now()}` })
      .returning()
    console.log('insert ok', route.id)

    await db.delete(supplyRoutes).where(eq(supplyRoutes.id, route.id))
    console.log('cleanup ok')
  } catch (e) {
    const err = e as Error & { cause?: Error }
    console.error('DB error:', err.message || err)
    if (err.cause) console.error('cause:', err.cause.message || err.cause)
    process.exit(1)
  }
}

void main()
