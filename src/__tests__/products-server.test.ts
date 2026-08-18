import { describe, it, expect } from 'vitest'
import { db } from '#/db'
import { items, itemArticleNumbers, itemColors } from '#/db/schema'
import { eq } from 'drizzle-orm'

describe('items schema round-trip', () => {
  it('inserts an item, its color, and reads back via relation', async () => {
    const articleNumber = `TEST-${Date.now()}`
    const [p] = await db
      .insert(items)
      .values({
        name: 'Test Crew',
        design: 'Test',
      })
      .returning()
    await db.insert(itemArticleNumbers).values({ itemId: p.id, articleNumber })

    await db.insert(itemColors).values({
      itemId: p.id,
      colorName: 'Burgundy',
      colorHex: '#7b1f2b',
    })

    const fetched = await db.query.items.findFirst({
      where: eq(items.id, p.id),
      with: { colors: true },
    })
    expect(fetched?.colors).toHaveLength(1)
    expect(fetched?.colors[0].colorName).toBe('Burgundy')

    await db.delete(items).where(eq(items.id, p.id))
  })
})
