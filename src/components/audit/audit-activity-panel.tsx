import { useEffect, useState } from "react"
import { Button } from "#/components/ui/button"
import { AuditLogTable } from "./audit-log-table"
import { listAuditLogByArticle } from "#/server/functions/audit/list-by-article"
import type { AuditLogRow } from "#/server/functions/audit/list"

interface Props {
  articleNumber: string
}

type Cursor = { effectiveDate: Date; id: string } | null

export function AuditActivityPanel({ articleNumber }: Props) {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listAuditLogByArticle({ data: { articleNumber, pageSize: 25 } })
      .then((out) => {
        if (cancelled) return
        setRows(out.rows)
        setCursor(out.nextCursor)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [articleNumber])

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    try {
      const out = await listAuditLogByArticle({
        data: { articleNumber, pageSize: 25, cursor },
      })
      setRows((prev) => [...prev, ...out.rows])
      setCursor(out.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground">
          Every recorded event for this article — receipts, transfers, sales, returns.
        </p>
      </div>
      <AuditLogTable
        rows={rows}
        emptyMessage={loading ? "Loading…" : "No recorded activity for this article yet."}
      />
      {cursor && (
        <Button variant="outline" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  )
}
