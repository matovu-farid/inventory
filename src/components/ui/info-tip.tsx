import * as React from 'react'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { helpDict } from '#/lib/help-dictionary'
import type { HelpEntry, HelpKey } from '#/lib/help-dictionary'
import { cn } from '#/lib/utils'

interface InfoTipProps {
  /** Key into the help dictionary. */
  term: HelpKey
  /** Override the auto-generated `aria-label` on the icon button. */
  ariaLabel?: string
  /** Additional classes for the icon button. */
  className?: string
  /** Tooltip side. Defaults to "top". */
  side?: React.ComponentProps<typeof TooltipContent>['side']
}

/**
 * Small info-icon button that opens a tooltip explaining a domain term.
 * Use for table column headers, KPI card titles, status badges, etc.
 *
 * For form-field labels, prefer `<FieldLabel help="…">` which composes this.
 */
function InfoTip({ term, ariaLabel, className, side = 'top' }: InfoTipProps) {
  const entry: HelpEntry = helpDict[term]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? `Help: ${term}`}
          className={cn(
            'inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none',
            className,
          )}
        >
          <Info className="size-3.5" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={6}
        className="max-w-xs rounded-lg px-3 py-2 text-xs leading-relaxed shadow-md"
      >
        <p>{entry.description}</p>
        {entry.example && (
          <p className="mt-1.5 text-[11px] opacity-70">
            <span className="font-medium">Example:</span> {entry.example}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export { InfoTip }
