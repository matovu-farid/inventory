import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { addSupplyRouteExpense } from '#/server/functions/supply/expenses'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { MoneyInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

export const EXPENSE_CATEGORIES = [
  'freight',
  'shipping',
  'customs',
  'ticket',
  'transportation',
  'insurance',
  'tax',
  'miscellaneous',
] as const

const EXPENSE_CURRENCIES = ['USD', 'RMB', 'UGX'] as const

function defaultExpenseRate(
  currency: (typeof EXPENSE_CURRENCIES)[number],
  rateUgxPerUsd?: string | null,
  rateRmbPerUsd?: string | null,
) {
  if (currency === 'RMB' && rateUgxPerUsd && rateRmbPerUsd) {
    return new BigNumber(rateUgxPerUsd).div(rateRmbPerUsd).toFixed(2)
  }
  return currency === 'USD' ? (rateUgxPerUsd ?? '') : ''
}

export function AddExpenseForm({
  supplyRouteId,
  rateUgxPerUsd,
  rateRmbPerUsd,
  onSuccess,
}: {
  supplyRouteId: string
  rateUgxPerUsd?: string | null
  rateRmbPerUsd?: string | null
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] =
    useState<(typeof EXPENSE_CURRENCIES)[number]>('USD')
  const [ugxRate, setUgxRate] = useState(
    defaultExpenseRate('USD', rateUgxPerUsd, rateRmbPerUsd),
  )
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const errs: Record<string, string> = {}
    if (!category) errs.category = 'Select a category'
    if (!amount || Number(amount) <= 0) errs.amount = 'Enter a valid amount'
    if (currency !== 'UGX' && (!ugxRate || Number(ugxRate) <= 0)) {
      errs.ugxRate = 'Enter a valid rate'
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    try {
      await addSupplyRouteExpense({
        data: {
          supplyRouteId,
          category: category as (typeof EXPENSE_CATEGORIES)[number],
          description: (form.get('description') as string) || undefined,
          amount,
          currency,
          exchangeRate: currency !== 'UGX' ? ugxRate : undefined,
        },
      })
      onSuccess()
    } catch (err) {
      console.error('Failed to add expense:', err)
      setFormErrors({
        form: err instanceof Error ? err.message : 'Failed to save',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e)
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <FieldLabel htmlFor="expense-category" help="expense.category">
          Category *
        </FieldLabel>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger
            id="expense-category"
            aria-invalid={!!formErrors.category || undefined}
            aria-describedby={
              formErrors.category ? 'expense-category-error' : undefined
            }
          >
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.category && (
          <p id="expense-category-error" className="text-xs text-destructive">
            {formErrors.category}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="description" help="expense.description">
          Description
        </FieldLabel>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="expense-amount" help="expense.amount">
            Amount *
          </FieldLabel>
          <MoneyInput
            id="expense-amount"
            name="amount"
            currency={currency}
            decimals={currency === 'UGX' ? 0 : 2}
            roundTo={currency === 'UGX' ? 50 : undefined}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            error={formErrors.amount}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="expense-currency" help="item.currency">
            Currency
          </FieldLabel>
          <Select
            value={currency}
            onValueChange={(value: (typeof EXPENSE_CURRENCIES)[number]) => {
              setCurrency(value)
              setUgxRate(
                defaultExpenseRate(value, rateUgxPerUsd, rateRmbPerUsd),
              )
            }}
          >
            <SelectTrigger id="expense-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="RMB">RMB</SelectItem>
              <SelectItem value="UGX">UGX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {currency !== 'UGX' && (
        <div className="space-y-2">
          <FieldLabel htmlFor="expense-rate" help="item.ugxPerUsd">
            UGX per 1 {currency} *
          </FieldLabel>
          <MoneyInput
            id="expense-rate"
            name="exchangeRate"
            currency={`UGX/${currency}`}
            value={ugxRate}
            onChange={setUgxRate}
            decimals={0}
            placeholder="e.g. 3750"
            error={formErrors.ugxRate}
          />
        </div>
      )}

      {formErrors.form && (
        <p role="alert" className="text-sm text-destructive">
          {formErrors.form}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Adding...' : 'Add Expense'}
      </Button>
    </form>
  )
}
