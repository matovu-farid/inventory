/** Photo-handoff session internals backed by the test Postgres database. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import {
  itemColors,
  itemArticleNumbers,
  itemImages,
  items,
  pictureUploadTokens,
  pictureUploads,
  user as userTable,
} from '#/db/schema'
import * as internal from '#/server/functions/items/photo-handoff-internals'
import { attachPhotoSessionImages } from '#/server/functions/items/images.server'

let runId: string
let userId: string
let itemId: string
let colorId: string

async function seed() {
  runId = `ph-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  userId = runId
  await db.insert(userTable).values({
    id: userId,
    name: `Admin ${runId}`,
    email: `${runId}@test.local`,
    emailVerified: true,
    role: 'admin',
  })
  const [item] = await db
    .insert(items)
    .values({ name: `T ${runId}`, design: 'Test' })
    .returning()
  await db
    .insert(itemArticleNumbers)
    .values({ itemId: item.id, articleNumber: runId })
  itemId = item.id
  const [color] = await db
    .insert(itemColors)
    .values({ itemId, colorName: 'Red', colorHex: '#dc2626' })
    .returning()
  colorId = color.id
}

async function insertToken(
  token: string,
  values: Partial<typeof pictureUploadTokens.$inferInsert> = {},
) {
  await db.insert(pictureUploadTokens).values({
    token,
    itemId,
    itemColorId: colorId,
    createdBy: userId,
    expiresAt: new Date(Date.now() + 60_000),
    ...values,
  })
}

async function teardown() {
  await db.delete(pictureUploads).where(eq(pictureUploads.itemId, itemId))
  await db
    .delete(pictureUploadTokens)
    .where(eq(pictureUploadTokens.itemId, itemId))
  await db.delete(itemColors).where(eq(itemColors.itemId, itemId))
  await db.delete(items).where(eq(items.id, itemId))
  await db.delete(userTable).where(eq(userTable.id, userId))
}

describe('photo-handoff internals', () => {
  beforeEach(seed)
  afterEach(teardown)

  it('rejects expired tokens', async () => {
    const token = `${runId}-old`
    await insertToken(token, { expiresAt: new Date(Date.now() - 60_000) })
    await expect(internal.validateToken(token)).rejects.toThrow(/expired/i)
  })

  it('rejects completed tokens', async () => {
    const token = `${runId}-used`
    await insertToken(token, { completedAt: new Date() })
    await expect(internal.validateToken(token)).rejects.toThrow(/completed/i)
  })

  it('rejects missing tokens', async () => {
    await expect(internal.validateToken('no-such-token')).rejects.toThrow(
      /not found/i,
    )
  })

  it('allows several confirmed uploads before completion', async () => {
    const token = `${runId}-multi`
    await insertToken(token)
    const first = await internal.reservePhotoUpload(token)
    const second = await internal.reservePhotoUpload(token)
    const suggestion = {
      name: 'Navy',
      hex: '#0a1d40',
      sampledHex: '#112244',
    }
    await internal.confirmPhotoUploadRow(token, first.id, suggestion)
    await internal.confirmPhotoUploadRow(token, second.id, suggestion)

    const uploads = await db.query.pictureUploads.findMany({
      where: and(
        eq(pictureUploads.itemId, itemId),
        eq(pictureUploads.tokenId, first.tokenId),
      ),
    })
    expect(uploads).toHaveLength(2)
    expect(uploads.every((upload) => upload.uploadedAt)).toBe(true)

    await internal.completePhotoUploadSession(token)
    await expect(internal.reservePhotoUpload(token)).rejects.toThrow(
      /completed/i,
    )
  })

  it('rejects a confirmation from another token', async () => {
    const firstToken = `${runId}-first`
    const secondToken = `${runId}-second`
    await insertToken(firstToken)
    await insertToken(secondToken)
    const upload = await internal.reservePhotoUpload(firstToken)
    await expect(
      internal.confirmPhotoUploadRow(secondToken, upload.id),
    ).rejects.toThrow(/not found|owned/i)
  })

  it('rejects malformed suggestions and enforces the session image limit', async () => {
    const token = `${runId}-limit`
    await insertToken(token)
    const first = await internal.reservePhotoUpload(token)

    await expect(
      internal.confirmPhotoUploadRow(token, first.id, {
        name: 'Navy',
        hex: '#not-hex',
        sampledHex: '#112244',
      }),
    ).rejects.toThrow(/invalid color suggestion hex/i)

    for (let index = 1; index < 12; index += 1) {
      await internal.reservePhotoUpload(token)
    }
    await expect(internal.reservePhotoUpload(token)).rejects.toThrow(
      /at most 12 images/i,
    )
  })

  it('attaches a completed phone session to the item gallery', async () => {
    const token = `${runId}-item-gallery`
    await insertToken(token, { itemColorId: null })
    const upload = await internal.reservePhotoUpload(token)
    await internal.confirmPhotoUploadRow(token, upload.id, {
      name: 'Navy',
      hex: '#0a1d40',
      sampledHex: '#112244',
    })
    await internal.completePhotoUploadSession(token)

    const rows = await attachPhotoSessionImages({ token, itemId })

    expect(rows).toHaveLength(1)
    expect(
      rows[0] && 'suggestedColorName' in rows[0]
        ? rows[0].suggestedColorName
        : undefined,
    ).toBe('Navy')
    const stored = await db.query.itemImages.findMany({
      where: eq(itemImages.itemId, itemId),
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.suggestedColorHex).toBe('#0a1d40')
  })

  it('rejects an ambiguous item-and-color attachment destination', async () => {
    const token = `${runId}-ambiguous`
    await insertToken(token, { itemColorId: null })
    await internal.completePhotoUploadSession(token)

    await expect(
      attachPhotoSessionImages({ token, itemId, itemColorId: colorId }),
    ).rejects.toThrow(/exactly one/i)
  })
})
