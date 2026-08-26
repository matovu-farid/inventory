import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReceiptSection } from '../receipt-section'

describe('ReceiptSection SSR', () => {
  it('renders a server-safe fallback before the grid loads in the browser', () => {
    expect(() =>
      renderToString(
        <ReceiptSection
          supplyRouteId="route-1"
          routeRates={{}}
          suppliers={[]}
          onChanged={() => undefined}
        />,
      ),
    ).not.toThrow()
  })
})
