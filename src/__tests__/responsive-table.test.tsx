// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResponsiveTable } from '#/components/ui/responsive-table'

afterEach(cleanup)

function setMatches(matches: boolean) {
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
    vi.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 767px)',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }))
}

type Row = { id: string; name: string; qty: number }
const rows: Row[] = [
  { id: 'a', name: 'Tee', qty: 3 },
  { id: 'b', name: 'Bomber', qty: 1 },
]

describe('ResponsiveTable', () => {
  beforeEach(() => setMatches(false))

  it('renders as table on desktop', () => {
    setMatches(false)
    render(
      <ResponsiveTable<Row>
        data={rows}
        getRowKey={(r) => r.id}
        columns={[
          { header: 'Name', cell: (r) => r.name },
          { header: 'Qty', cell: (r) => r.qty },
        ]}
      />,
    )
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('Tee')).toBeTruthy()
  })

  it('renders as card list on mobile', () => {
    setMatches(true)
    const { container } = render(
      <ResponsiveTable<Row>
        data={rows}
        getRowKey={(r) => r.id}
        columns={[
          { header: 'Name', cell: (r) => r.name },
          { header: 'Qty', cell: (r) => r.qty },
        ]}
      />,
    )
    expect(container.querySelector('table')).toBeNull()
    expect(screen.getByText('Tee')).toBeTruthy()
    expect(screen.getByText('Bomber')).toBeTruthy()
  })

  it('shows empty state when data is empty', () => {
    setMatches(false)
    render(
      <ResponsiveTable<Row>
        data={[]}
        getRowKey={(r) => r.id}
        columns={[{ header: 'Name', cell: (r) => r.name }]}
        emptyMessage="No data yet"
      />,
    )
    expect(screen.getByText('No data yet')).toBeTruthy()
  })
})
