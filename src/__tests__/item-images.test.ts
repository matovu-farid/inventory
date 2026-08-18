import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { itemArticleNumbers, itemImages, items } from '#/db/schema'
import {
  attachItemImages,
  removeItemImageRecord,
} from '#/server/functions/items/images.server'

let itemId: string
let articleNumber: string

beforeEach(async () => {
  articleNumber = `item-images-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  const [item] = await db
    .insert(items)
    .values({
      name: 'Item image test',
      design: 'Test',
    })
    .returning()
  itemId = item.id
  await db.insert(itemArticleNumbers).values({ itemId, articleNumber })
})

afterEach(async () => {
  await db.delete(itemImages).where(eq(itemImages.itemId, itemId))
  await db.delete(items).where(eq(items.id, itemId))
})

describe('item images', () => {
  it('stores multiple item photos in gallery order with color suggestions', async () => {
    const rows = await attachItemImages({
      itemId,
      images: [
        {
          imageS3Key: `items/${itemId}/one.jpg`,
          suggestion: {
            name: 'Navy',
            hex: '#0a1d40',
            sampledHex: '#112244',
          },
        },
        {
          imageS3Key: `items/${itemId}/two.jpg`,
          suggestion: {
            name: 'Blue',
            hex: '#2244aa',
            sampledHex: '#3355bb',
          },
        },
      ],
    })

    expect(rows.map((row) => row.imageS3Key)).toEqual([
      `items/${itemId}/one.jpg`,
      `items/${itemId}/two.jpg`,
    ])
    expect(rows[0]?.suggestedColorName).toBe('Navy')
    expect(rows[1]?.suggestedColorHex).toBe('#2244aa')
  })

  it('removes an item photo and promotes the next thumbnail', async () => {
    const first = `items/${itemId}/first.jpg`
    const second = `items/${itemId}/second.jpg`
    await attachItemImages({
      itemId,
      images: [{ imageS3Key: first }, { imageS3Key: second }],
    })

    const result = await removeItemImageRecord({
      itemId,
      imageS3Key: first,
    })

    expect(result).toEqual({
      removedImageS3Key: first,
      primaryImageS3Key: second,
    })
    const remaining = await db.query.itemImages.findMany({
      where: eq(itemImages.itemId, itemId),
      orderBy: (images, { asc }) => [asc(images.sortOrder)],
    })
    expect(remaining.map((row) => row.imageS3Key)).toEqual([second])
  })

  it('rejects an image key that is outside the item prefix', async () => {
    await expect(
      attachItemImages({
        itemId,
        images: [{ imageS3Key: 'items/another-item/photo.jpg' }],
      }),
    ).rejects.toThrow('Image key does not belong to item')
  })
})
