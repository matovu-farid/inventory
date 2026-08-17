// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Combobox } from '#/components/ui/combobox'

afterEach(cleanup)

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)
Element.prototype.scrollIntoView = vi.fn()

describe('Combobox create row', () => {
  it('shows the plus create row for an unmatched query and returns the trimmed value', () => {
    const onCreateNew = vi.fn()
    render(
      <Combobox
        options={[{ value: 'supplier-1', label: 'Acme' }]}
        onChange={vi.fn()}
        onCreateNew={onCreateNew}
      />,
    )

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: '  danny  ' },
    })

    const createRow = screen.getByRole('option', { name: 'Create “danny”' })
    expect(createRow).toBeTruthy()
    fireEvent.click(createRow)

    expect(onCreateNew).toHaveBeenCalledWith('danny')
  })

  it('does not show the create row for an exact case-insensitive match', () => {
    render(
      <Combobox
        options={[{ value: 'supplier-1', label: 'Acme' }]}
        onChange={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: ' acme ' },
    })

    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull()
  })
})
