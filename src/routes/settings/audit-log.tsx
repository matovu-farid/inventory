import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FieldLabel } from '#/components/ui/field-label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { AuditLogTable } from '#/components/audit/audit-log-table'
import { listAuditLog } from '#/server/functions/audit/list'
import type { AuditLogRow } from '#/server/functions/audit/list'
import { AUDIT_ACTION_LABELS } from '#/server/audit/descriptions'

export const Route = createFileRoute('/settings/audit-log')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'audit.view'),
  loader: async () => {
    const initial = await listAuditLog({ data: { pageSize: 50 } })
    return { initial }
  },
  component: AuditLogPage,
})

type Cursor = { effectiveDate: Date; id: string } | null

function AuditLogPage() {
  const { initial } = Route.useLoaderData()
  const [rows, setRows] = useState<AuditLogRow[]>(initial.rows)
  const [cursor, setCursor] = useState<Cursor>(initial.nextCursor)
  const [filters, setFilters] = useState({
    articleNumber: '',
    action: '',
    from: '',
    to: '',
  })
  const [loading, setLoading] = useState(false)

  function buildFilterPayload() {
    return {
      articleNumber: filters.articleNumber || undefined,
      actions: filters.action ? [filters.action] : undefined,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59`) : undefined,
      pageSize: 50,
    }
  }

  async function applyFilters() {
    setLoading(true)
    try {
      const out = await listAuditLog({ data: buildFilterPayload() })
      setRows(out.rows)
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    try {
      const out = await listAuditLog({
        data: { ...buildFilterPayload(), cursor },
      })
      setRows((prev) => [...prev, ...out.rows])
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setFilters({ articleNumber: '', action: '', from: '', to: '' })
    void applyFilters()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-muted-foreground">
          Every recorded event in the system. Use filters to narrow down.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <FieldLabel help="col.filterArticle">Article number</FieldLabel>
          <Input
            value={filters.articleNumber}
            onChange={(e) =>
              setFilters((f) => ({ ...f, articleNumber: e.target.value }))
            }
            placeholder="e.g. CB-1234"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterAction">Action</FieldLabel>
          <Select
            value={filters.action || 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, action: v === 'all' ? '' : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(AUDIT_ACTION_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterDateRange">From</FieldLabel>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((f) => ({ ...f, from: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel help="col.filterDateRange">To</FieldLabel>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void applyFilters()} disabled={loading}>
          Apply filters
        </Button>
        <Button variant="outline" onClick={clearFilters} disabled={loading}>
          Clear
        </Button>
      </div>

      <AuditLogTable rows={rows} />

      {cursor && (
        <Button
          variant="outline"
          onClick={() => void loadMore()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
