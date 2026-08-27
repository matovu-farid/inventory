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

    fireEvent.change(screen.getByRole('combobox', { name: 'Supplier *' }), {
      target: { value: 'supplier-1' },
    })
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Supplier *' }), {
      target: { value: 'supplier-1' },
    })
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
    fireEvent.change(supplier, { target: { value: 'supplier-1' } })
    expect((supplier as unknown as HTMLSelectElement).value).toBe('supplier-1')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect((supplier as unknown as HTMLSelectElement).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect((supplier as unknown as HTMLSelectElement).value).toBe('supplier-1')
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Supplier *' }), {
      target: { value: 'supplier-1' },
    })
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
})
