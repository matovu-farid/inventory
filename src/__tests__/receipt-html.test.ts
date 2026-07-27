/**
 * Receipt HTML rendering.
 *
 * Verifies the template embeds critical fields and applies HTML escaping.
 * Visual layout (80mm thermal vs A4) is validated manually in a real browser.
 */
import { describe, it, expect } from 'vitest'
import { renderSaleReceipt } from '#/lib/pdf/receipt-html'

const baseSale = {
  documentNumber: 'S-001',
  saleDate: new Date('2026-05-13T10:30:00Z'),
  shopName: 'Kampala Main',
  totalAmount: '135000',
  paymentMethod: 'cash' as const,
  customerName: null,
  clerkName: null,
  items: [
    {
      itemName: 'TR-001 Crew Tee · Red / M',
      quantity: 2,
      unitPriceUgx: '45000',
      totalPriceUgx: '90000',
    },
    {
      itemName: 'JK-100 Bomber · Black / L',
      quantity: 1,
      unitPriceUgx: '45000',
      totalPriceUgx: '45000',
    },
  ],
}

describe('renderSaleReceipt', () => {
  it('includes the shop name and document number', () => {
    const html = renderSaleReceipt(baseSale)
    expect(html).toContain('Kampala Main')
    expect(html).toContain('S-001')
  })

  it('renders one row per item', () => {
    const html = renderSaleReceipt(baseSale)
    expect(html).toContain('TR-001 Crew Tee · Red / M')
    expect(html).toContain('JK-100 Bomber · Black / L')
  })

  it('includes the clerk name when present', () => {
    const html = renderSaleReceipt({ ...baseSale, clerkName: 'Farid Matovu' })
    expect(html).toContain('Farid Matovu')
    expect(html).toContain('<strong>Clerk:</strong>')
  })

  it('omits clerk line when null', () => {
    const html = renderSaleReceipt(baseSale)
    expect(html).not.toContain('<strong>Clerk:</strong>')
  })

  it('escapes HTML in user-supplied fields', () => {
    const html = renderSaleReceipt({
      ...baseSale,
      shopName: '<script>alert("xss")</script>',
      items: [
        {
          itemName: '<img onerror=alert(1)>',
          quantity: 1,
          unitPriceUgx: '1000',
          totalPriceUgx: '1000',
        },
      ],
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img onerror=alert')
    expect(html).toContain('&lt;script&gt;alert')
    expect(html).toContain('&lt;img onerror=alert')
  })

  it('includes the 80mm thermal print CSS', () => {
    const html = renderSaleReceipt(baseSale)
    expect(html).toContain('@page { size: 80mm auto')
    expect(html).toContain('width: 72mm')
  })

  it('includes the total amount', () => {
    const html = renderSaleReceipt(baseSale)
    expect(html).toContain('135,000')
    expect(html).toContain('Total:')
  })
})
