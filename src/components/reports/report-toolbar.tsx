import * as React from 'react'
import { Printer, Download, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'

export interface ReportToolbarProps {
  from: string
  to: string
  onApply: (from: string, to: string) => void
  onClear: () => void
  onPrint?: () => void
  onExportCsv?: () => void
}

export function ReportToolbar({
  from,
  to,
  onApply,
  onClear,
  onPrint,
  onExportCsv,
}: ReportToolbarProps) {
  const [draftFrom, setDraftFrom] = React.useState(from)
  const [draftTo, setDraftTo] = React.useState(to)

  React.useEffect(() => {
    setDraftFrom(from)
    setDraftTo(to)
  }, [from, to])

  const invalidRange = Boolean(draftFrom && draftTo && draftFrom > draftTo)
  const hasRange = Boolean(draftFrom || draftTo)

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label
            htmlFor="report-from"
            className="text-xs font-medium text-muted-foreground"
          >
            From date
          </label>
          <DatePicker
            id="report-from"
            value={draftFrom}
            onChange={setDraftFrom}
            placeholder="Start date"
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="report-to"
            className="text-xs font-medium text-muted-foreground"
          >
            To date
          </label>
          <DatePicker
            id="report-to"
            value={draftTo}
            onChange={setDraftTo}
            placeholder="End date"
            className="w-44"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onApply(draftFrom, draftTo)}
            disabled={invalidRange}
          >
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={!hasRange}
          >
            <RotateCcw />
            Clear
          </Button>
        </div>
        {invalidRange && (
          <p className="basis-full text-xs text-destructive" role="alert">
            Start date must be on or before end date.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onPrint && (
          <Button type="button" size="sm" variant="outline" onClick={onPrint}>
            <Printer />
            Print
          </Button>
        )}
        {onExportCsv && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExportCsv}
          >
            <Download />
            Export CSV
          </Button>
        )}
      </div>
    </div>
  )
}
