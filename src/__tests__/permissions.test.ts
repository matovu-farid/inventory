import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PERMISSION_SERVER_GATES } from '#/lib/permissions'

const repoRoot = resolve(__dirname, '../..')

describe('UI permission registry', () => {
  it('every Permission references at least one server-gate file', () => {
    for (const [perm, files] of Object.entries(PERMISSION_SERVER_GATES)) {
      expect(
        files.length,
        `Permission "${perm}" has no server gate listed`,
      ).toBeGreaterThan(0)
    }
  })

  it('every listed server-gate file exists and calls a role-checking helper', () => {
    for (const [perm, files] of Object.entries(PERMISSION_SERVER_GATES)) {
      for (const rel of files) {
        const abs = resolve(repoRoot, rel)
        expect(
          existsSync(abs),
          `Permission "${perm}" references missing file: ${rel}`,
        ).toBe(true)
        const src = readFileSync(abs, 'utf8')
        // Accept either the low-level requireRole(session, ...) call or the
        // requireSessionAndRole([...]) convenience helper that wraps it.
        const callsRoleGuard =
          src.includes('requireRole(') || src.includes('requireSessionAndRole(')
        expect(
          callsRoleGuard,
          `Permission "${perm}" references ${rel}, but it does not call requireRole or requireSessionAndRole`,
        ).toBe(true)
      }
    }
  })
})
