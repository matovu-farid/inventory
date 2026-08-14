import { Check, ChevronDown, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { getErrorDiagnostics } from '#/lib/error-handling'

interface ErrorDetailsProps {
  error: unknown
  development?: boolean
}

export function ErrorDetails({
  error,
  development = import.meta.env.DEV,
}: ErrorDetailsProps) {
  const diagnostics = getErrorDiagnostics(error, development)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'message' | 'stack' | null>(null)

  if (!diagnostics) return null

  async function copy(value: string, kind: 'message' | 'stack') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
    } catch {
      // Clipboard access can be denied in an insecure or restricted context.
    }
  }

  const stack = diagnostics.stack || 'No stack trace available.'

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-left"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-3 text-xs text-muted-foreground"
        >
          Show error details
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-amber-500/20 p-3">
        <DiagnosticValue
          label="Message"
          value={diagnostics.message}
          copied={copied === 'message'}
          onCopy={() => void copy(diagnostics.message, 'message')}
        />
        <DiagnosticValue
          label="Stack"
          value={stack}
          copied={copied === 'stack'}
          onCopy={() => void copy(stack, 'stack')}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function DiagnosticValue({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCopy}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="size-3" aria-hidden="true" />
          ) : (
            <Copy className="size-3" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/80 p-2 font-mono text-[11px] leading-5 text-foreground/80">
        {value}
      </pre>
    </div>
  )
}
