import { describe, it, expect } from 'vitest'
import {
  renderAuditDescription,
  auditActionLabel,
  AUDIT_ACTION_LABELS,
} from '#/server/audit/descriptions'

describe('renderAuditDescription', () => {
  it('renders store.receiveGoods with both dates when backdated', () => {
    const out = renderAuditDescription('store.receiveGoods', {
      actorName: 'Mary',
      routeName: 'Spring 2026',
      itemCount: 3,
      totalReceived: 48,
      totalTransitLoss: 0,
      businessDate: new Date('2026-04-10T00:00:00Z'),
      recordedAt: new Date('2026-05-22T10:00:00Z'),
    })
    expect(out).toContain('Mary received')
    expect(out).toContain('Spring 2026')
    expect(out).toContain('2026-04-10')
    expect(out).toContain('2026-05-22')
  })

  it('renders store.receiveGoods without business-date phrase when same-day', () => {
    const sameDay = new Date('2026-05-22T10:00:00Z')
    const out = renderAuditDescription('store.receiveGoods', {
      actorName: 'Mary',
      routeName: 'Spring 2026',
      itemCount: 3,
      totalReceived: 48,
      totalTransitLoss: 0,
      businessDate: sameDay,
      recordedAt: sameDay,
    })
    expect(out).not.toMatch(/business date/i)
  })

  it('renders sale.create with shop and amount', () => {
    const out = renderAuditDescription('sale.create', {
      actorName: 'Janet',
      shopName: 'Kireka',
      itemCount: 2,
      totalAmount: '80000',
      paymentMethod: 'cash',
    })
    expect(out).toContain('Janet sold')
    expect(out).toContain('Kireka')
    expect(out).toContain('80,000')
    expect(out).toContain('cash')
  })

  it('renders transfer.create with from/to locations', () => {
    const out = renderAuditDescription('transfer.create', {
      actorName: 'James',
      shopName: 'Kireka',
      itemCount: 5,
    })
    expect(out).toContain('James dispatched')
    expect(out).toContain('Kireka')
  })

  it('renders every known action without throwing', () => {
    for (const action of Object.keys(AUDIT_ACTION_LABELS)) {
      const out = renderAuditDescription(action, {
        actorName: 'User',
        recordedAt: new Date(),
      })
      expect(typeof out).toBe('string')
      expect(out.length).toBeGreaterThan(0)
    }
  })

  it('auditActionLabel returns the friendly name', () => {
    expect(auditActionLabel('store.receiveGoods')).toMatch(/receive/i)
    expect(auditActionLabel('sale.create')).toMatch(/sale/i)
  })

  it('auditActionLabel falls back to the action code for unknown actions', () => {
    expect(auditActionLabel('custom.unknown')).toBe('custom.unknown')
  })
})
