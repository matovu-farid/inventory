import { useState, Fragment } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { InfoTip } from '#/components/ui/info-tip'
import { Badge } from '#/components/ui/badge'
import { auditActionLabel } from '#/server/audit/descriptions'
import { formatDayKampala } from '#/lib/business-date'
import type { AuditLogRow } from '#/server/functions/audit/list'

interface Props {
  rows: AuditLogRow[]
  emptyMessage?: string
}

export function AuditLogTable({
  rows,
  emptyMessage = 'No recorded activity yet.',
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Business date <InfoTip term="col.businessDate" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Recorded <InfoTip term="col.recordedDate" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Who <InfoTip term="col.actor" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Action <InfoTip term="col.action" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Activity <InfoTip term="col.activity" />
              </span>
            </TableHead>
            <TableHead aria-label="Expand" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const effective = row.businessDate ?? row.createdAt
            const isExpanded = expanded.has(row.id)
            return (
              <Fragment key={row.id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap">
                    {formatDayKampala(effective)}
                    {row.businessDate ? null : (
                      <Badge variant="outline" className="ml-2 text-xs">
                        recorded
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDayKampala(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.actorName ?? '(unknown)'}</TableCell>
                  <TableCell>{auditActionLabel(row.action)}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(row.id)}
                    >
                      {isExpanded ? 'Hide' : 'Details'}
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {JSON.stringify(
                          {
                            before: row.before,
                            after: row.after,
                            metadata: row.metadata,
                            articleNumbers: row.articleNumbers,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
