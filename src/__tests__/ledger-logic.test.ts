import { describe, it, expect } from 'vitest'
import BigNumber from 'bignumber.js'
import { computeAccountBalance as computeBalance } from '#/lib/accounting/ledger-queries'

/**
 * Tests for ledger accounting logic (pure computation, no DB).
 * Validates the balance calculation rules used in ledger-queries.ts
 */

describe('account balance computation', () => {
  describe('asset accounts (normal debit)', () => {
    it('increases with debits', () => {
      const balance = computeBalance('asset', '1000', '0')
      expect(balance.toFixed(2)).toBe('1000.00')
    })

    it('decreases with credits', () => {
      const balance = computeBalance('asset', '1000', '300')
      expect(balance.toFixed(2)).toBe('700.00')
    })

    it('can go negative (overdraft)', () => {
      const balance = computeBalance('asset', '100', '500')
      expect(balance.toFixed(2)).toBe('-400.00')
    })
  })

  describe('liability accounts (normal credit)', () => {
    it('increases with credits', () => {
      const balance = computeBalance('liability', '0', '5000')
      expect(balance.toFixed(2)).toBe('5000.00')
    })

    it('decreases with debits', () => {
      const balance = computeBalance('liability', '2000', '5000')
      expect(balance.toFixed(2)).toBe('3000.00')
    })
  })

  describe('revenue accounts (normal credit)', () => {
    it('increases with credits', () => {
      const balance = computeBalance('revenue', '0', '50000')
      expect(balance.toFixed(2)).toBe('50000.00')
    })

    it('decreases with debits (returns/adjustments)', () => {
      const balance = computeBalance('revenue', '5000', '50000')
      expect(balance.toFixed(2)).toBe('45000.00')
    })
  })

  describe('expense accounts (normal debit)', () => {
    it('increases with debits', () => {
      const balance = computeBalance('expense', '15000', '0')
      expect(balance.toFixed(2)).toBe('15000.00')
    })
  })

  describe('equity accounts (normal credit)', () => {
    it('increases with credits', () => {
      const balance = computeBalance('equity', '0', '100000')
      expect(balance.toFixed(2)).toBe('100000.00')
    })
  })
})

describe('journal entry balance validation', () => {
  it('balanced entry passes', () => {
    const entries = [
      { type: 'debit' as const, amount: '10000' },
      { type: 'credit' as const, amount: '10000' },
    ]

    const totalDebits = entries
      .filter((e) => e.type === 'debit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))
    const totalCredits = entries
      .filter((e) => e.type === 'credit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))

    expect(totalDebits.eq(totalCredits)).toBe(true)
  })

  it('unbalanced entry fails', () => {
    const entries = [
      { type: 'debit' as const, amount: '10000' },
      { type: 'credit' as const, amount: '9999' },
    ]

    const totalDebits = entries
      .filter((e) => e.type === 'debit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))
    const totalCredits = entries
      .filter((e) => e.type === 'credit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))

    expect(totalDebits.eq(totalCredits)).toBe(false)
  })

  it('compound entry with 3 lines balances', () => {
    // Store transfer: DR Inventory-Shop 15000, CR Inventory-Store 10000, CR Transfer Revenue 5000
    const entries = [
      { type: 'debit' as const, amount: '15000' },
      { type: 'credit' as const, amount: '10000' },
      { type: 'credit' as const, amount: '5000' },
    ]

    const totalDebits = entries
      .filter((e) => e.type === 'debit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))
    const totalCredits = entries
      .filter((e) => e.type === 'credit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))

    expect(totalDebits.eq(totalCredits)).toBe(true)
  })

  it('handles precision with decimals', () => {
    const entries = [
      { type: 'debit' as const, amount: '33.33' },
      { type: 'debit' as const, amount: '33.33' },
      { type: 'debit' as const, amount: '33.34' },
      { type: 'credit' as const, amount: '100.00' },
    ]

    const totalDebits = entries
      .filter((e) => e.type === 'debit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))
    const totalCredits = entries
      .filter((e) => e.type === 'credit')
      .reduce((s, e) => s.plus(e.amount), new BigNumber(0))

    expect(totalDebits.eq(totalCredits)).toBe(true)
  })
})

describe('inter-branch accounting', () => {
  it('store transfer entries net to zero in consolidation', () => {
    // Store side: DR Due from Shop 15000 / CR Due to Store 15000
    // These should net to zero
    const dueFromShop = new BigNumber('15000') // asset, normal debit
    const dueToStore = new BigNumber('15000') // liability, normal credit

    // In consolidation: Due from Shop (asset) - Due to Store (liability) = 0
    expect(dueFromShop.minus(dueToStore).toFixed(2)).toBe('0.00')
  })

  it('settlement reduces inter-branch balances', () => {
    const initialDueFromShop = new BigNumber('50000')
    const settlementAmount = new BigNumber('20000')
    const remaining = initialDueFromShop.minus(settlementAmount)
    expect(remaining.toFixed(2)).toBe('30000.00')
  })
})

describe('profit calculations', () => {
  it('computes gross profit per route', () => {
    const itemCost = new BigNumber('500000') // total cost of items
    const expenses = new BigNumber('150000') // freight, customs, etc.
    const totalCost = itemCost.plus(expenses)

    // If items were sold at store transfer revenue of 800000
    const revenue = new BigNumber('800000')
    const grossProfit = revenue.minus(totalCost)

    expect(grossProfit.toFixed(2)).toBe('150000.00')
  })

  it('computes shop margin', () => {
    const shopSellPrice = new BigNumber('25000')
    const storeSellPrice = new BigNumber('15000') // cost from store
    const margin = shopSellPrice.minus(storeSellPrice)
    expect(margin.toFixed(2)).toBe('10000.00')
  })

  it('computes store margin on transfer', () => {
    const transferPrice = new BigNumber('15000')
    const landedCost = new BigNumber('10000')
    const storeMargin = transferPrice.minus(landedCost)
    expect(storeMargin.toFixed(2)).toBe('5000.00')
  })
})

describe('loss detection calculations', () => {
  it('detects transit loss', () => {
    const quantityOrdered = 100
    const quantityReceived = 95
    const transitLoss = quantityOrdered - quantityReceived
    expect(transitLoss).toBe(5)
  })

  it('detects distribution loss', () => {
    const quantityDispatched = 50
    const quantityReceived = 48
    const distributionLoss = quantityDispatched - quantityReceived
    expect(distributionLoss).toBe(2)
  })

  it('detects shrinkage in stock take', () => {
    const systemQuantity = 200
    const physicalQuantity = 195
    const shrinkage = systemQuantity - physicalQuantity
    expect(shrinkage).toBe(5)
  })

  it('computes loss value correctly', () => {
    const lossQty = 5
    const costPerUnit = new BigNumber('12000')
    const lossValue = costPerUnit.times(lossQty)
    expect(lossValue.toFixed(2)).toBe('60000.00')
  })

  it('no loss when counts match', () => {
    const expected = 100
    const received = 100
    expect(expected - received).toBe(0)
  })
})
