// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { NotFoundPage, RouteErrorPage } from '#/components/error-pages'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

afterEach(cleanup)

describe('NotFoundPage', () => {
  it('offers a dashboard recovery link without exposing implementation details', () => {
    render(<NotFoundPage />)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Back to dashboard' })
        .getAttribute('href'),
    ).toBe('/')
  })
})

describe('RouteErrorPage', () => {
  it('retries through the route boundary and offers dashboard recovery', () => {
    const reset = vi.fn()
    render(<RouteErrorPage error={new Error('secret')} reset={reset} />)

    expect(screen.getByRole('heading', { name: 'We hit a snag' })).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(
      screen
        .getByRole('link', { name: 'Back to dashboard' })
        .getAttribute('href'),
    ).toBe('/')
  })
})
