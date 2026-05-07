import * as React from "react"
import { Label } from "#/components/ui/label"
import { InfoTip } from "#/components/ui/info-tip"
import type { HelpKey } from "#/lib/help-dictionary"
import { cn } from "#/lib/utils"

interface FieldLabelProps extends React.ComponentProps<typeof Label> {
  /** Key into the help dictionary. Renders an info icon + tooltip when set. */
  help?: HelpKey
}

function FieldLabel({ help, children, className, ...props }: FieldLabelProps) {
  return (
    <Label className={cn("gap-1.5", className)} {...props}>
      {children}
      {help && (
        <InfoTip
          term={help}
          ariaLabel={
            typeof children === "string"
              ? `What is ${children}?`
              : "What is this field?"
          }
        />
      )}
    </Label>
  )
}

export { FieldLabel }
