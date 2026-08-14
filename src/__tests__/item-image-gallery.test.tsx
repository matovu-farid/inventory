// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemImageGallery } from '#/components/items/item-image-gallery'

afterEach(() => cleanup())

const images = [
  {
    id: 'image-1',
    imageS3Key: 'items/item-1/one.jpg',
    suggestedColorName: 'Navy',
    suggestedColorHex: '#0a1d40',
    sampledHex: '#112244',
  },
  {
    id: 'image-2',
    imageS3Key: 'items/item-1/two.jpg',
    suggestedColorName: null,
    suggestedColorHex: null,
    sampledHex: null,
  },
]

describe('ItemImageGallery', () => {
  it('shows one primary image with removable thumbnails', () => {
    render(
      <ItemImageGallery
        itemName="Plain jumper"
        images={images}
        canManage
        actions={<button type="button">Add images</button>}
        onRequestRemove={vi.fn()}
        onDetectColors={vi.fn()}
        detecting={false}
        suggestions={[]}
        existingColorNames={[]}
        selectedSuggestionKeys={new Set()}
        onToggleSuggestion={vi.fn()}
        onConfirmSuggestions={vi.fn()}
        confirming={false}
      />,
    )

    expect(screen.getByRole('heading', { name: /photos/i })).toBeTruthy()
    expect(
      screen.getByRole('img', { name: /plain jumper photo 1/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /show photo 2/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove photo 1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove photo 2/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /detect colors/i })).toBeTruthy()
  })

  it('requires confirmation before adding a detected color', () => {
    render(
      <ItemImageGallery
        itemName="Plain jumper"
        images={images}
        canManage
        actions={null}
        onRequestRemove={vi.fn()}
        onDetectColors={vi.fn()}
        detecting={false}
        suggestions={[
          {
            name: 'Navy',
            hex: '#0a1d40',
            sampledHex: '#112244',
            imageCount: 1,
          },
        ]}
        existingColorNames={[]}
        selectedSuggestionKeys={new Set(['navy\u0000#0a1d40'])}
        onToggleSuggestion={vi.fn()}
        onConfirmSuggestions={vi.fn()}
        confirming={false}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /suggested colors/i }),
    ).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /navy/i })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /add selected colors/i }),
    ).toBeTruthy()
  })
})
