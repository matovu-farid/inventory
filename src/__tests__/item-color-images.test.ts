import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { itemColorImages, itemColors, items } from '#/db/schema'
import { attachItemColorImages } from '#/server/functions/items/images.server'

let itemId: string
let colorId: string
const runId = `images-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

beforeEach(async () => {
  const [item] = await db
    .insert(items)
    .values({ articleNumber: runId, name: 'Image test item', category: 'Test' })
    .returning()
  itemId = item.id
  const [color] = await db
    .insert(itemColors)
    .values({ itemId, colorName: 'Navy', colorHex: '#0a1d40' })
    .returning()
  colorId = color.id
})

afterEach(async () => {
  await db
    .delete(itemColorImages)
    .where(eq(itemColorImages.itemColorId, colorId))
  await db.delete(itemColors).where(eq(itemColors.id, colorId))
  await db.delete(items).where(eq(items.id, itemId))
})

describe('item color images', () => {
  it('persists every image and keeps the first image as primary', async () => {
    const rows = await attachItemColorImages({
      itemColorId: colorId,
      imageS3Keys: ['items/x/one.jpg', 'items/x/two.jpg'],
    })

    expect(rows.map((row) => row.imageS3Key)).toEqual([
      'items/x/one.jpg',
      'items/x/two.jpg',
    ])
    const color = await db.query.itemColors.findFirst({
      where: eq(itemColors.id, colorId),
    })
    expect(color?.imageS3Key).toBe('items/x/one.jpg')
  })
})
