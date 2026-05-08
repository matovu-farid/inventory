// src/components/prerequisites/prereq-empty-state.tsx
import { ClipboardList, ArrowRight } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "#/components/ui/button"
import { Card, CardContent } from "#/components/ui/card"
import { cn } from "#/lib/utils"
import type { MissingPrereq } from "#/lib/prerequisites/types"

interface PrereqEmptyStateProps {
  items: MissingPrereq[]
  /** Optional override for the heading. Defaults to "Set up required". */
  heading?: string
  /** Optional override for the subtitle. */
  subtitle?: string
  /**
   * If true, each row may render a secondary "Open page →" link using
   * `pageHref`/`pageLabel` extras attached to the items. Used by /settings.
   */
  showPageLinks?: boolean
  className?: string
}

/** Looser shape allowed by callers that pass items with pageHref/pageLabel. */
type ItemWithMaybePageRef = MissingPrereq & {
  pageHref?: string
  pageLabel?: string
}

export function PrereqEmptyState({
  items,
  heading = "Set up required",
  subtitle,
  showPageLinks = false,
  className,
}: PrereqEmptyStateProps) {
  const sub =
    subtitle ??
    (items.length === 1
      ? "One thing needs to be in place before you can use this page."
      : `${items.length} things need to be in place before you can use this page.`)

  return (
    <Card className={cn("max-w-2xl", className)}>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <ClipboardList className="size-5" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-tight">{heading}</h2>
            <p className="text-sm text-muted-foreground">{sub}</p>
          </div>
        </div>

        <ul className="space-y-3">
          {(items as ItemWithMaybePageRef[]).map((item) => (
            <li
              key={`${item.id}-${item.pageHref ?? ""}`}
              className="rounded-md border border-border/60 bg-muted/30 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium leading-tight">
                    {item.title}
                  </p>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    {item.why}
                  </p>
                </div>
                {showPageLinks && item.pageHref && (
                  <Link
                    to={item.pageHref}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Open {item.pageLabel ?? "page"}
                    <ArrowRight className="size-3" strokeWidth={1.75} />
                  </Link>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.actions.map((a) => (
                  <Button key={`${item.id}-${a.href}`} asChild size="sm">
                    <Link to={a.href}>{a.label}</Link>
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
