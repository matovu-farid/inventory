import { describe, it, expect } from 'vitest'
import { requireRole, hasRole } from '../server/middleware/rbac'
import type { Session } from '../lib/auth'

function makeSession(role: string): Session {
  return {
    user: {
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
      banned: false,
    },
    session: {
      id: 'sess-1',
      userId: 'user-1',
      token: 'tok',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }
}

describe('requireRole', () => {
  it('allows admin for admin-only actions', () => {
    expect(() => requireRole(makeSession('admin'), ['admin'])).not.toThrow()
  })

  it('allows supervisor for supervisor-allowed actions', () => {
    expect(() =>
      requireRole(makeSession('supervisor'), ['admin', 'supervisor']),
    ).not.toThrow()
  })

  it('blocks sales from admin-only actions', () => {
    expect(() => requireRole(makeSession('sales'), ['admin'])).toThrow(
      'Forbidden',
    )
  })

  it('blocks sales from supervisor actions', () => {
    expect(() =>
      requireRole(makeSession('sales'), ['admin', 'supervisor']),
    ).toThrow('Forbidden')
  })

  it('allows sales for sales-permitted actions', () => {
    expect(() =>
      requireRole(makeSession('sales'), ['admin', 'supervisor', 'sales']),
    ).not.toThrow()
  })

  it('blocks when role is undefined', () => {
    const session = makeSession('')
    ;(session.user as { role?: string }).role = undefined
    expect(() => requireRole(session, ['admin'])).toThrow('Forbidden')
  })
})

describe('hasRole', () => {
  it('returns true when role matches', () => {
    expect(hasRole(makeSession('admin'), ['admin'])).toBe(true)
  })

  it("returns false when role doesn't match", () => {
    expect(hasRole(makeSession('sales'), ['admin'])).toBe(false)
  })

  it('handles multiple allowed roles', () => {
    expect(hasRole(makeSession('supervisor'), ['admin', 'supervisor'])).toBe(
      true,
    )
  })
})
