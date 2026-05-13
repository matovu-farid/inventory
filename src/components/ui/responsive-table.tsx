import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useIsMobile } from "#/lib/hooks/use-is-mobile"
import { cn } from "#/lib/utils"

export type ResponsiveColumn<T> = {
  header: string
  cell: (row: T) => React.ReactNode
  mobileLabel?: string
  className?: string
  align?: "left" | "right"
  hideOnMobile?: boolean
}

type Props<T> = {
  data: T[]
  columns: ResponsiveColumn<T>[]
  getRowKey: (row: T) => string
  emptyMessage?: string
  className?: string
  onRowClick?: (row: T) => void
}

export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  emptyMessage = "No data.",
  className,
  onRowClick,
}: Props<T>) {
  const isMobile = useIsMobile()

  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-2", className)}>
        {data.map((row) => {
          const inner = (
            <div className="space-y-1.5">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.header} className="flex items-start justify-between gap-3 text-sm">
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {c.mobileLabel ?? c.header}
                    </span>
                    <span className={cn("min-w-0 text-right", c.align === "left" && "text-left")}>{c.cell(row)}</span>
                  </div>
                ))}
            </div>
          )
          return onRowClick ? (
            <button
              key={getRowKey(row)}
              type="button"
              onClick={() => onRowClick(row)}
              className="block w-full rounded-lg border bg-card p-3 text-left"
            >
              {inner}
            </button>
          ) : (
            <div key={getRowKey(row)} className="rounded-lg border bg-card p-3">
              {inner}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={cn(c.align === "right" && "text-right", c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((c) => (
                <TableCell key={c.header} className={cn(c.align === "right" && "text-right", c.className)}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
