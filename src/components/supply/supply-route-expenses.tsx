import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { formatUgx } from '#/lib/format'
import { convertExpenseToUgx } from '#/lib/currency/expense-conversion'
import { deleteSupplyRouteExpense } from '#/server/functions/supply/expenses'
import { AddExpenseForm } from './add-expense-form'

type RouteExpense = {
  id: string
  category: string
  description: string | null
  amount: string
  currency: string | null
  exchangeRate: string | null
}

function expenseAmountUgx(expense: RouteExpense) {
  const currency = expense.currency ?? 'UGX'
  try {
    return new BigNumber(
      convertExpenseToUgx({
        amount: expense.amount,
        currency,
        exchangeRate: expense.exchangeRate ?? undefined,
      }),
    )
  } catch {
    return null
  }
}

export function SupplyRouteExpenses({
  supplyRouteId,
  rateUgxPerUsd,
  rateRmbPerUsd,
  expenses,
  onChanged,
  disabled = false,
}: {
  supplyRouteId: string
  rateUgxPerUsd?: string | null
  rateRmbPerUsd?: string | null
  expenses: ReadonlyArray<RouteExpense>
  onChanged: () => void
  disabled?: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleDelete(expense: RouteExpense) {
    if (!window.confirm(`Remove ${expense.category} expense?`)) return
    setDeletingId(expense.id)
    try {
      await deleteSupplyRouteExpense({ data: { id: expense.id } })
      setError('')
      onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete expense',
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Route expenses</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Record shipping, travel, tax, and other costs that belong to this
              supply route. Rent and salary are recorded at the shop.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => setDialogOpen(true)}
            >
              Add expense
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add route expense</DialogTitle>
              </DialogHeader>
              <AddExpenseForm
                supplyRouteId={supplyRouteId}
                rateUgxPerUsd={rateUgxPerUsd}
                rateRmbPerUsd={rateRmbPerUsd}
                onSuccess={() => {
                  setDialogOpen(false)
                  onChanged()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {expenses.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No expenses recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Total UGX
                  </th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => {
                  const totalUgx = expenseAmountUgx(expense)
                  return (
                    <tr key={expense.id} className="border-t">
                      <td className="px-3 py-2">
                        <Badge variant="outline">{expense.category}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {expense.description || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {new BigNumber(expense.amount).toFormat(2)}{' '}
                        {expense.currency ?? 'UGX'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {expense.exchangeRate
                          ? new BigNumber(expense.exchangeRate).toFormat(2)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {totalUgx ? formatUgx(totalUgx) : 'Conversion needed'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={deletingId === expense.id || disabled}
                          onClick={() => void handleDelete(expense)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
