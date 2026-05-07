// src/components/prerequisites/prereq-banner.tsx
import { AlertTriangle } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"
import type { MissingPrereq } from "#/lib/prerequisites/types"

interface PrereqBannerProps {
  /** Soft prereqs only — hard ones should never reach this component. */
  items: MissingPrereq[]
  className?: string
}

/**
 * Soft-prereq inline alert rendered above a page's body.
 * Renders nothing when items is empty.
 */
export function PrereqBanner({ items, className }: PrereqBannerProps) {
  if (items.length === 0) return null

  return (
    <div
      className={cn(
        "rounded-md border border-amber-300/60 bg-amber-50/80 p-4 text-amber-900",
        "dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="flex-1 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="space-y-1.5">
              <p className="text-sm font-medium leading-tight">{item.title}</p>
              <p className="text-[13px] leading-snug opacity-90">{item.why}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {item.actions.map((a) => (
                  <Button
                    key={`${item.id}-${a.href}`}
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-[12px]"
                  >
                    <Link to={a.href}>{a.label}</Link>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
