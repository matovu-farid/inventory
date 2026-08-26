// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorCellEditor } from '../color-cell-editor'

describe('ColorCellEditor', () => {
  afterEach(cleanup)
  it('reports the selected names together with their catalog ids', () => {
    const onColorSelection = vi.fn()

    render(
      <ColorCellEditor
        initialValue=""
        catalogItem={{
          id: 'item-1',
          name: 'Press Jacket',
          design: 'Jacket',
          articleNumbers: [],
          colors: [{ id: 'black-id', colorName: 'Black', colorHex: '#000000' }],
        }}
        onChange={vi.fn()}
        onFinishedEditing={vi.fn()}
        onColorSelection={onColorSelection}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Black' }))

    expect(onColorSelection).toHaveBeenLastCalledWith(['black-id'], 'Black', '#000000')
  })

  it('does not commit the parent row while the user is typing', () => {
    const onColorSelection = vi.fn()
    const onChange = vi.fn()

    render(
      <ColorCellEditor
        initialValue=""
        catalogItem={null}
        onChange={onChange}
        onFinishedEditing={vi.fn()}
        onColorSelection={onColorSelection}
      />,
    )

    const input = screen.getByLabelText('Colours')
    input.focus()
    fireEvent.change(input, { target: { value: 'Blue' } })

    expect(document.activeElement).toBe(input)
    expect(onColorSelection).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('suggests and replaces only the colour segment after the last comma', () => {
    const onColorSelection = vi.fn()

    render(
      <ColorCellEditor
        initialValue="Black, bl"
        catalogItem={{
          id: 'item-1',
          name: 'Press Jacket',
          design: 'Jacket',
          articleNumbers: [],
          colors: [{ id: 'blue-id', colorName: 'Blue', colorHex: '#0000ff' }],
        }}
        onChange={vi.fn()}
        onFinishedEditing={vi.fn()}
        onColorSelection={onColorSelection}
      />,
    )

    expect(screen.getByRole('option', { name: /Blue/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /Blue/i }))

    expect(onColorSelection).toHaveBeenLastCalledWith(
      ['blue-id'],
      'Black, Blue',
      ', #0000ff',
    )
  })

  it('adds a second colour when a colour button is clicked', () => {
    const onColorSelection = vi.fn()

    render(
      <ColorCellEditor
        initialValue="Black"
        catalogItem={{
          id: 'item-1',
          name: 'Press Jacket',
          design: 'Jacket',
          articleNumbers: [],
          colors: [
            { id: 'black-id', colorName: 'Black', colorHex: '#000000' },
            { id: 'blue-id', colorName: 'Blue', colorHex: '#0000ff' },
          ],
        }}
        onChange={vi.fn()}
        onFinishedEditing={vi.fn()}
        onColorSelection={onColorSelection}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))

    expect(onColorSelection).toHaveBeenLastCalledWith(
      ['black-id', 'blue-id'],
      'Black, Blue',
      '#000000, #0000ff',
    )
  })
})
