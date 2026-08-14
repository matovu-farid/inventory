import * as React from 'react'
import { Info } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { helpDict } from '#/lib/help-dictionary'
import type { HelpEntry, HelpKey } from '#/lib/help-dictionary'
import { cn } from '#/lib/utils'

interface InfoPopoverProps {
  children?: React.ReactNode
  term?: HelpKey
  ariaLabel?: string
  className?: string
  triggerClassName?: string
  side?: React.ComponentProps<typeof PopoverContent>['side']
  sideOffset?: React.ComponentProps<typeof PopoverContent>['sideOffset']
  align?: React.ComponentProps<typeof PopoverContent>['align']
}

function InfoPopover({
  children,
  term,
  ariaLabel,
  className,
  triggerClassName,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
}: InfoPopoverProps) {
  const entry: HelpEntry | undefined = term ? helpDict[term] : undefined
  const resolvedAriaLabel =
    ariaLabel ?? (term ? `Help: ${term}` : 'More information')
  const content = entry ? (
    <>
      <p>{entry.description}</p>
      {entry.example && (
        <p className="mt-1.5 text-[11px] opacity-70">
          <span className="font-medium">Example:</span> {entry.example}
        </p>
      )}
    </>
  ) : (
    children
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={resolvedAriaLabel}
          className={cn(
            'inline-flex cursor-help items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none',
            triggerClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'max-h-96 w-80 overflow-y-auto p-4 text-xs leading-relaxed',
          className,
        )}
        side={side}
        sideOffset={sideOffset}
        align={align}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}

export { InfoPopover }
