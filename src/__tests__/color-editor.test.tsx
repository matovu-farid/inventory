// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorEditor } from '#/components/items/color-editor'

vi.mock('#/server/functions/items/colors', () => ({
  addItemColor: vi.fn(),
}))

vi.mock('#/components/items/photo-handoff-qr', () => ({
  PhotoCapture: () => null,
}))

vi.mock('#/server/functions/items/photo-handoff', () => ({
  attachPhotoSessionImages: vi.fn(),
}))

vi.mock('#/server/functions/items/uploads', () => ({
  attachUploadedItemImage: vi.fn(),
  getItemImageUploadUrl: vi.fn(),
}))

afterEach(() => cleanup())

describe('ColorEditor', () => {
  it('keeps color creation focused on choosing a color', () => {
    render(<ColorEditor itemId="item-1" onCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: /save color/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /upload photos/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /choose images/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /use phone/i })).toBeNull()
  })
})
