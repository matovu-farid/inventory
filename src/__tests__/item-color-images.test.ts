import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import {
  itemArticleNumbers,
  itemColorImages,
  itemColors,
  items,
} from '#/db/schema'
import {
  attachItemColorImages,
  removeItemColorImageRecord,
} from '#/server/functions/items/images.server'

let itemId: string
let colorId: string
const runId = `images-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

beforeEach(async () => {
  const [item] = await db
    .insert(items)
    .values({ name: 'Image test item', design: 'Test' })
    .returning()
  itemId = item.id
  await db.insert(itemArticleNumbers).values({ itemId, articleNumber: runId })
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

  it('removes an image association and promotes the next image', async () => {
    const first = `items/${itemId}/${colorId}/first.jpg`
    const second = `items/${itemId}/${colorId}/second.jpg`
    const third = `items/${itemId}/${colorId}/third.jpg`
    await attachItemColorImages({
      itemColorId: colorId,
      imageS3Keys: [first, second, third],
    })

    const result = await removeItemColorImageRecord({
      itemColorId: colorId,
      imageS3Key: first,
    })

    expect(result).toEqual({
      removedImageS3Key: first,
      primaryImageS3Key: second,
    })
    const remaining = await db.query.itemColorImages.findMany({
      where: eq(itemColorImages.itemColorId, colorId),
      orderBy: (images, { asc }) => [asc(images.sortOrder)],
    })
    expect(remaining.map((row) => row.imageS3Key)).toEqual([second, third])
  })

  it('clears the primary when the final image is removed', async () => {
    const only = `items/${itemId}/${colorId}/only.jpg`
    await attachItemColorImages({
      itemColorId: colorId,
      imageS3Keys: [only],
    })

    const result = await removeItemColorImageRecord({
      itemColorId: colorId,
      imageS3Key: only,
    })

    expect(result.primaryImageS3Key).toBeNull()
    const color = await db.query.itemColors.findFirst({
      where: eq(itemColors.id, colorId),
    })
    expect(color?.imageS3Key).toBeNull()
  })

  it('rejects an image key that belongs to another color path', async () => {
    await expect(
      removeItemColorImageRecord({
        itemColorId: colorId,
        imageS3Key: `items/${itemId}/another-color/photo.jpg`,
      }),
    ).rejects.toThrow('Image key does not belong to color')
  })
})
