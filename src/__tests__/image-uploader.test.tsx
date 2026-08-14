// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageUploader } from '#/components/items/image-uploader'

afterEach(cleanup)

describe('ImageUploader', () => {
  it('exposes separate camera and multi-file gallery actions', () => {
    const { container } = render(<ImageUploader onAssetsChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /take photo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /upload photos/i })).toBeTruthy()
    expect(container.querySelector('input[multiple]')).toBeTruthy()
  })
})
