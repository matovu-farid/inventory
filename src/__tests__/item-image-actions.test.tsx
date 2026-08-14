// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemImageActions } from '#/components/items/item-image-actions'

vi.mock('#/components/items/photo-handoff-qr', () => ({
  PhotoCapture: () => (
    <div>
      <button type="button">Choose images</button>
      <button type="button">Use phone (QR)</button>
    </div>
  ),
}))

afterEach(() => cleanup())

describe('ItemImageActions', () => {
  it('opens one gallery-level entry point for local and phone images', () => {
    render(<ItemImageActions itemId="item-1" onUploaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /add images/i }))

    expect(screen.getByRole('button', { name: /choose images/i })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /use phone \(qr\)/i }),
    ).toBeTruthy()
  })
})
