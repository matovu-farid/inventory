// src/lib/prerequisites/types.ts
export type PrereqSeverity = "hard" | "soft"

export interface PrereqAction {
  /** Button label, e.g. "Go to Supply Routes" */
  label: string
  /** Internal route href, e.g. "/supply" */
  href: string
}

export interface MissingPrereq {
  /** Stable key — used as React key and for analytics. e.g. "no-receivable-routes" */
  id: string
  severity: PrereqSeverity
  /** Short title shown as the row's headline. */
  title: string
  /** 1-2 sentence user-facing explanation of why this matters. */
  why: string
  /** Non-empty list of CTA buttons. At least one is required by design. */
  actions: [PrereqAction, ...PrereqAction[]]
}

export interface PrerequisiteResult {
  /** True iff there are no `severity: "hard"` items in `missing`. */
  satisfied: boolean
  /** Hard items first, then soft, in display order. */
  missing: MissingPrereq[]
}

/** Per-page entry inside a system-wide summary. */
export interface SystemPrereqItem extends MissingPrereq {
  /** Route the prereq unblocks, e.g. "/store/receiving" */
  pageHref: string
  /** Sidebar label for that page, e.g. "Receiving" */
  pageLabel: string
}

export interface SystemPrereqsSummary {
  /** Total page prereq checks performed (one per page that declares prereqs). */
  totalChecks: number
  /**
   * Pages that are usable — no hard prereqs blocking. Soft-warning pages
   * are still counted as passing because they render and work; the
   * `satisfiedPages` array below is the strict "no issues at all" set.
   */
  passing: number
  /** Pages with ≥1 hard prereq missing. */
  failingHard: number
  /** Pages with ≥1 soft prereq missing (and zero hard). */
  failingSoft: number
  /** All missing items across all pages (hard first, then soft). */
  items: SystemPrereqItem[]
  /** Pages that passed, listed for the "All set" section on /settings. */
  satisfiedPages: Array<{ pageHref: string; pageLabel: string }>
}

/** Helper for derive functions. Builds a satisfied-result. Frozen to make
 * the shared singleton safe against accidental mutation by callers. */
export const SATISFIED: PrerequisiteResult = Object.freeze({
  satisfied: true,
  missing: Object.freeze([]) as unknown as MissingPrereq[],
})
