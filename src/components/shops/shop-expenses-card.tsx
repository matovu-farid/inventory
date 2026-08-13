import { useCallback, useEffect, useState } from 'react'
import BigNumber from 'bignumber.js'
import {
  addLocationExpense,
  listLocationExpenses,
} from '#/server/functions/shop/expenses'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

const CATEGORIES = [
  'rent',
  'salary',
  'tax',
  'transport',
  'utilities',
  'miscellaneous',
] as const

type ShopExpense = Awaited<ReturnType<typeof listLocationExpenses>>[number]

export function ShopExpensesCard({ shopId }: { shopId: string }) {
  const [expenses, setExpenses] = useState<ShopExpense[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [category, setCategory] = useState('rent')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setExpenses(
      await listLocationExpenses({
        data: { locationType: 'shop', locationId: shopId },
      }),
    )
  }, [shopId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !amount ||
      !new BigNumber(amount).isFinite() ||
      !new BigNumber(amount).gt(0)
    ) {
      setError('Enter a positive amount')
      return
    }
    setPending(true)
    try {
      await addLocationExpense({
        data: {
          locationType: 'shop',
          locationId: shopId,
          category,
          description: description || undefined,
          amount,
          expenseDate,
          paymentMethod,
        },
      })
      setAmount('')
      setDescription('')
      setError('')
      setDialogOpen(false)
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save expense',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Shop expenses</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Record rent, salary, tax, and other operating costs for this shop.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button type="button" onClick={() => setDialogOpen(true)}>
            Add expense
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add shop expense</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(event) => void handleSubmit(event)}
              className="space-y-4"
            >
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Expense category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
                aria-label="Expense description"
              />
              <MoneyInput
                currency="UGX"
                value={amount}
                onChange={setAmount}
                decimals={0}
                roundTo={50}
                placeholder="Amount in UGX"
                aria-label="Expense amount in UGX"
              />
              <Input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                aria-label="Expense date"
              />
              <Select
                value={paymentMethod}
                onValueChange={(value: 'cash' | 'bank') =>
                  setPaymentMethod(value)
                }
              >
                <SelectTrigger aria-label="Payment method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Saving…' : 'Save expense'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shop expenses recorded.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Amount (UGX)
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-t">
                    <td className="px-3 py-2">{expense.expenseDate}</td>
                    <td className="px-3 py-2 capitalize">{expense.category}</td>
                    <td className="px-3 py-2">{expense.description || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {new BigNumber(expense.amount).toFormat(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
