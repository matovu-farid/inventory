import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

export interface SuggestionRow {
  alertId: string
  shopStockId: string
  itemId: string
  storeStockId: string | null
  variantId: string
  size: string
  itemLabel: string
  quantityOnHand: number
  baseline: number
  suggestedQuantity: number
  storeQuantity: number
}

export interface SuggestionSelection {
  itemId: string
  variantId: string
  quantity: number
  itemLabel: string
}

export function RestockSuggestionsTable({
  rows,
  preselectVariantId,
  onSubmit,
}: {
  rows: SuggestionRow[]
  preselectVariantId?: string
  onSubmit: (selections: SuggestionSelection[]) => Promise<void>
}) {
  const [picks, setPicks] = useState<
    Record<string, { checked: boolean; quantity: number }>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.alertId,
        {
          checked: preselectVariantId === r.variantId,
          quantity: Math.min(r.suggestedQuantity, r.storeQuantity),
        },
      ]),
    ),
  )
  const [submitting, setSubmitting] = useState(false)

  async function dispatch() {
    setSubmitting(true)
    try {
      const selections: SuggestionSelection[] = rows.flatMap((r) => {
        const pick = picks[r.alertId]
        if (!pick.checked) return []
        if (pick.quantity <= 0) return []
        return [
          {
            itemId: r.itemId,
            variantId: r.variantId,
            quantity: pick.quantity,
            itemLabel: r.itemLabel,
          },
        ]
      })
      await onSubmit(selections)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Item</TableHead>
            <TableHead>In shop</TableHead>
            <TableHead>Typical</TableHead>
            <TableHead>Suggested</TableHead>
            <TableHead>In warehouse</TableHead>
            <TableHead>Send</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const pick = picks[r.alertId]
            const disabled = !r.storeStockId || r.storeQuantity === 0
            return (
              <TableRow key={r.alertId}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={pick.checked}
                    disabled={disabled}
                    onChange={(e) =>
                      setPicks((p) => ({
                        ...p,
                        [r.alertId]: { ...pick, checked: e.target.checked },
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{r.itemLabel}</TableCell>
                <TableCell>{r.quantityOnHand}</TableCell>
                <TableCell>{r.baseline}</TableCell>
                <TableCell>{r.suggestedQuantity}</TableCell>
                <TableCell>{r.storeQuantity}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={r.storeQuantity}
                    value={pick.quantity}
                    disabled={disabled || !pick.checked}
                    onChange={(e) =>
                      setPicks((p) => ({
                        ...p,
                        [r.alertId]: {
                          ...pick,
                          quantity: Math.min(
                            Math.max(0, Number(e.target.value)),
                            r.storeQuantity,
                          ),
                        },
                      }))
                    }
                    className="w-20"
                  />
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-muted-foreground"
              >
                No low items at this shop right now.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Button
        onClick={() => {
          void dispatch()
        }}
        disabled={submitting}
      >
        {submitting ? 'Creating transfer…' : 'Create transfer'}
      </Button>
    </div>
  )
}
