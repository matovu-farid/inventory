// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReceiptGridRow } from '#/components/supply/receipt-grid/types'
import { ReceiptSection } from '../receipt-section'

function selectSupplier(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Supplier *' }))
  fireEvent.change(screen.getByPlaceholderText('Search suppliers...'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('option', { name }))
}

const { createReceipt, replaceReceipt, deleteReceipt } = vi.hoisted(() => ({
  createReceipt: vi.fn(),
  replaceReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
}))

vi.mock('#/server/functions/supply/receipts', () => ({
  createSupplyRouteReceipt: createReceipt,
  replaceSupplyRouteReceipt: replaceReceipt,
  deleteSupplyRouteReceipt: deleteReceipt,
}))

vi.mock('../receipt-grid/receipt-grid', () => ({
  ReceiptGrid: ({
    rows,
    onRowsChange,
    historyControls,
    disabled,
  }: {
    rows: ReceiptGridRow[]
    onRowsChange: (rows: ReceiptGridRow[]) => void
    historyControls?: {
      canUndo: boolean
      canRedo: boolean
      onUndo: () => void
      onRedo: () => void
    }
    disabled?: boolean
  }) => (
    <>
      {historyControls && (
        <>
          <button
            type="button"
            onClick={historyControls.onUndo}
            disabled={!historyControls.canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={historyControls.onRedo}
            disabled={!historyControls.canRedo}
          >
            Redo
          </button>
        </>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onRowsChange([
            {
              ...rows[0],
              design: 'Jacket',
              quantity: 1,
              unitPriceForeign: '3.00',
            },
          ])
        }
      >
        Fill incomplete line
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onRowsChange([
            {
              ...rows[0],
              design: 'Jacket',
              articleNumber: 'JKT-1',
              quantity: 1,
              unitPriceForeign: '3.00',
            },
          ])
        }
      >
        Fill complete line
      </button>
    </>
  ),
}))

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)
Element.prototype.scrollIntoView = vi.fn()

describe('ReceiptSection save validation', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('blocks a non-empty line without an art number', () => {
    render(
      <ReceiptSection
        supplyRouteId="route-1"
        routeRates={{}}
        suppliers={[
          {
            id: 'supplier-1',
            name: 'Supplier',
            type: 'local',
            country: null,
            deletedAt: null,
          },
        ]}
        onChanged={() => undefined}
      />,
    )

    selectSupplier('Supplier')
    fireEvent.click(
      screen.getByRole('button', { name: 'Fill incomplete line' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))

    expect(createReceipt).not.toHaveBeenCalled()
  })

  it('explains when a foreign receipt is missing its exchange rates', () => {
    render(
      <ReceiptSection
        supplyRouteId="route-1"
        routeRates={{}}
        suppliers={[
          {
            id: 'supplier-1',
            name: 'Supplier',
            type: 'local',
            country: null,
            deletedAt: null,
          },
        ]}
        onChanged={() => undefined}
      />,
    )

    selectSupplier('Supplier')
    fireEvent.click(screen.getByRole('button', { name: 'Fill complete line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))

    expect(screen.getByRole('alert').textContent).toContain(
      'Enter the RMB per USD exchange rate before saving this receipt',
    )
    expect(createReceipt).not.toHaveBeenCalled()
  })

  it('undoes and redoes receipt header changes with the same history as grid changes', () => {
    render(
      <ReceiptSection
        supplyRouteId="route-1"
        routeRates={{}}
        suppliers={[
          {
            id: 'supplier-1',
            name: 'Supplier',
            type: 'local',
            country: null,
            deletedAt: null,
          },
        ]}
        onChanged={() => undefined}
      />,
    )

    const supplier = screen.getByRole('combobox', { name: 'Supplier *' })
    selectSupplier('Supplier')
    expect(supplier.textContent).toContain('Supplier')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(supplier.textContent).toContain('Select supplier')

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(supplier.textContent).toContain('Supplier')
  })

  it('disables the receipt and shows a saving state while saving', async () => {
    let resolveSave!: () => void
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve
    })
    createReceipt.mockImplementationOnce(() => pendingSave)

    render(
      <ReceiptSection
        supplyRouteId="route-1"
        routeRates={{ ugxPerUsd: '3735', rmbPerUsd: '6.70' }}
        suppliers={[
          {
            id: 'supplier-1',
            name: 'Supplier',
            type: 'local',
            country: null,
            deletedAt: null,
          },
        ]}
        onChanged={() => undefined}
      />,
    )

    selectSupplier('Supplier')
    fireEvent.click(screen.getByRole('button', { name: 'Fill complete line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      'Saving receipt…',
    )
    expect(
      screen
        .getByRole('combobox', { name: 'Supplier *' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('textbox', { name: 'Receipt notes' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Fill complete line' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: /Saving/ }).hasAttribute('disabled'),
    ).toBe(true)

    resolveSave()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('uses the shared date picker for the optional receipt date', () => {
    render(
      <ReceiptSection
        supplyRouteId="route-1"
        routeRates={{}}
        suppliers={[]}
        onChanged={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Receipt date' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Receipt date' })).toBeNull()
  })
})
