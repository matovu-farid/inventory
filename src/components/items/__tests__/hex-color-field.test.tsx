// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HexColorField } from '../hex-color-field'

describe('HexColorField', () => {
  afterEach(cleanup)

  it('keeps picker pointer interactions inside the colour editor', () => {
    const onDismiss = vi.fn()
    const onChange = vi.fn()
    document.addEventListener('pointerdown', onDismiss)

    render(<HexColorField value="#000000" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick color' }))

    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Color' }))

    document.removeEventListener('pointerdown', onDismiss)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
