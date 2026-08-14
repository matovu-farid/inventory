import { InfoPopover } from '#/components/ui/info-popover'
import { helpDict } from '#/lib/help-dictionary'
import type { HelpEntry, HelpKey } from '#/lib/help-dictionary'

export function ReviewLabel({ label, help }: { label: string; help: HelpKey }) {
  const entry: HelpEntry = helpDict[help]

  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <InfoPopover ariaLabel={`What is ${label}?`}>
        <div className="space-y-1 text-xs">
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground">{entry.description}</p>
          {entry.example && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Example:</span> {entry.example}
            </p>
          )}
        </div>
      </InfoPopover>
    </span>
  )
}
