// src/components/prerequisites/page-prerequisites.tsx
import type { ReactNode } from 'react'
import type { PrerequisiteResult } from '#/lib/prerequisites/types'
import { PrereqBanner } from './prereq-banner'
import { PrereqEmptyState } from './prereq-empty-state'

interface PagePrerequisitesProps {
  result: PrerequisiteResult
  children: ReactNode
}

/**
 * Wraps the BODY of a page (page header should remain outside).
 *
 * - When `result.satisfied === false`, renders a full empty state in place
 *   of children.
 * - When satisfied but soft prereqs exist, renders a banner above children.
 * - Otherwise renders children unchanged.
 */
export function PagePrerequisites({
  result,
  children,
}: PagePrerequisitesProps) {
  if (!result.satisfied) {
    return <PrereqEmptyState items={result.missing} />
  }

  const softMissing = result.missing.filter((m) => m.severity === 'soft')
  if (softMissing.length === 0) return <>{children}</>

  return (
    <div className="space-y-6">
      <PrereqBanner items={softMissing} />
      {children}
    </div>
  )
}
