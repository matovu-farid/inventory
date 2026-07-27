// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CartProvider, useCart } from '#/components/pos/cart-context'
import type { CartItem } from '#/lib/pos/cart-reducer'

afterEach(cleanup)
beforeEach(() => window.localStorage.clear())

const item: CartItem = {
  shopStockId: 'stk1',
  itemId: 'itm1',
  variantId: 'var1',
  itemLabel: 'TR-001 Tee',
  imageUrl: null,
  colorHex: '#000',
  qty: 1,
  unitPriceUgx: '50000',
  minimumSellPriceUgx: '50000',
  belowMinimumReason: '',
  availableQty: 5,
}

function Harness() {
  const { state, add, remove, clear } = useCart()
  return (
    <div>
      <p data-testid="count">{state.items.length}</p>
      <button onClick={() => add(item)}>add</button>
      <button onClick={() => remove('stk1')}>remove</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

describe('CartProvider', () => {
  it('provides cart state and actions', () => {
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
    fireEvent.click(screen.getByText('add'))
    expect(screen.getByTestId('count').textContent).toBe('1')
    fireEvent.click(screen.getByText('remove'))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('persists to localStorage', () => {
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    fireEvent.click(screen.getByText('add'))
    const raw = window.localStorage.getItem('test-cart')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).items).toHaveLength(1)
  })

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem('test-cart', JSON.stringify({ items: [item] }))
    render(
      <CartProvider storageKey="test-cart">
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})
