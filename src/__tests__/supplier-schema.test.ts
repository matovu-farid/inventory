import { describe, expect, it } from 'vitest'
import { suppliers } from '#/db/schema'

describe('supplier archive schema', () => {
  it('defines a nullable deletedAt column', () => {
    expect(suppliers.deletedAt).toBeDefined()
    expect(suppliers.deletedAt.notNull).toBe(false)
  })
})
