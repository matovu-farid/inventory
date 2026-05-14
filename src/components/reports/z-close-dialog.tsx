import * as React from "react"
import BigNumber from "bignumber.js"
import { useRouter } from "@tanstack/react-router"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { formatUgxTotal } from "#/lib/format"
import { closeZReport } from "#/server/functions/accounting/shift-reports"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  shopId: string
  expectedCashUgx: string
}

export function ZCloseDialog({
  open,
  onOpenChange,
  shopId,
  expectedCashUgx,
}: Props) {
  const [declared, setDeclared] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [idemKey, setIdemKey] = React.useState(() => crypto.randomUUID())
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  React.useEffect(() => {
    if (open) {
      setDeclared("")
      setNotes("")
      setIdemKey(crypto.randomUUID())
      setError(null)
    }
  }, [open])

  const variance =
    declared === "" ? null : new BigNumber(declared).minus(expectedCashUgx)

  async function submit() {
    if (declared === "") return
    setSubmitting(true)
    setError(null)
    try {
      const row = await closeZReport({
        data: {
          shopId,
          declaredCashUgx: declared,
          notes: notes || undefined,
          idempotencyKey: idemKey,
        },
      })
      onOpenChange(false)
      window.open(`/reports/z/${row.id}?print=1`, "_blank")
      void router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close shift (Z)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expected cash</span>
            <span className="font-mono">{formatUgxTotal(expectedCashUgx)}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="declared">Declared cash (count the drawer)</Label>
            <Input
              id="declared"
              inputMode="numeric"
              value={declared}
              onChange={(e) => setDeclared(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
            />
          </div>
          {variance && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Variance</span>
              <span
                className={`font-mono ${
                  variance.isZero()
                    ? ""
                    : variance.isNegative()
                      ? "text-red-600"
                      : "text-amber-600"
                }`}
              >
                {formatUgxTotal(variance.toFixed(2))}
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={declared === "" || submitting}>
            {submitting ? "Closing…" : "Close shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
