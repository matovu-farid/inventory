// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReceiptRateInput } from '../receipt-rate-input'

describe('ReceiptRateInput', () => {
  afterEach(cleanup)
  it('groups a rate for display without changing its numeric value', () => {
    render(<ReceiptRateInput aria-label="UGX per USD" value="3735" onChange={() => undefined} />)

    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('3,735.00')
  })

  it('displays whole shillings when configured without decimals', () => {
    render(
      <ReceiptRateInput
        aria-label="UGX per USD"
        decimals={0}
        value="3735"
        onChange={() => undefined}
      />,
    )

    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('3,735')
  })

  it('emits an unformatted numeric string while editing', () => {
    let value = '3,735.00'
    render(
      <ReceiptRateInput
        aria-label="UGX per USD"
        value="3735"
        onChange={(next) => {
          value = next
        }}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '4000' } })

    expect(value).toBe('4000')
  })
})
