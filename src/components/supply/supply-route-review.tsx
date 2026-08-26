import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { ReviewLabel } from '#/components/supply/review-label'
import { cn } from '#/lib/utils'
import { formatUgx, formatUgxTotal } from '#/lib/format'
import type { HelpKey } from '#/lib/help-dictionary'
import {
  buildSupplyRouteReview,
  groupSupplyRouteReviewLines,
} from '#/lib/supply-route-review'
import type {
  SupplyRouteReviewExpenseInput,
  SupplyRouteReviewLineInput,
} from '#/lib/supply-route-review'

function formatSourceAmount(amount: BigNumber, currency: string) {
  return `${amount.toFormat(currency === 'UGX' ? 0 : 2)} ${currency}`
}

function formatRate(foreignCurrency: string, foreignToUsd: BigNumber | null) {
  if (foreignCurrency === 'UGX') return '—'
  if (foreignCurrency === 'USD') return '1'
  return foreignToUsd ? foreignToUsd.toFormat(2) : 'Rate missing'
}

function formatGroupSourceSpend(
  lines: ReadonlyArray<
    ReturnType<typeof buildSupplyRouteReview>['lines'][number]
  >,
) {
  const totals = new Map<string, BigNumber>()
  for (const line of lines) {
    totals.set(
      line.sourceCurrency,
      (totals.get(line.sourceCurrency) ?? new BigNumber(0)).plus(
        line.sourceTotal,
      ),
    )
  }
  return [...totals.entries()]
    .map(([currency, amount]) => formatSourceAmount(amount, currency))
    .join(' · ')
}

const purchaseReviewColumns = [
  ['Route date', 'reviewCol.routeDate'],
  ['Supplier', 'reviewCol.supplier'],
  ['Variant', 'col.variant'],
  ['Ex. rate', 'item.sourceRate'],
  ['Qty', 'item.quantity'],
  ['Unit price', 'item.unitPrice'],
  ['Total amount', 'col.totalForeign'],
  ['Total USD', 'col.totalUsd'],
  ['USD rate', 'item.ugxPerUsd'],
  ['Total cost (UGX)', 'col.totalUgx'],
  ['Selling/unit', 'reviewCol.sellingUnit'],
  ['Total selling', 'reviewCol.totalSelling'],
  ['Gross profit', 'reviewCol.grossProfit'],
] satisfies ReadonlyArray<[string, HelpKey]>

function Stat({
  label,
  value,
  help,
  tone = 'default',
}: {
  label: string
  value: string
  help: HelpKey
  tone?: 'default' | 'positive' | 'negative'
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        <ReviewLabel label={label} help={help} />
      </p>
      <p
        className={`mt-1 font-mono text-sm font-semibold ${
          tone === 'positive'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'negative'
              ? 'text-destructive'
              : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function SupplyRouteReview({
  lines,
  expenses,
  routeDetails,
}: {
  lines: ReadonlyArray<SupplyRouteReviewLineInput>
  expenses: ReadonlyArray<SupplyRouteReviewExpenseInput>
  routeDetails?: {
    name: string
    departureDate: string | null
    returnDate: string | null
    budgetUsd: string | null
    rateUgxPerUsd: string | null
    rateRmbPerUsd: string | null
    notes: string | null
    suppliers: ReadonlyArray<string>
  }
}) {
  const summary = buildSupplyRouteReview(lines, expenses)
  const itemGroups = groupSupplyRouteReviewLines(summary.lines)
  const [openItemKeys, setOpenItemKeys] = useState<string[]>([])

  const grossProfitTone = summary.totals.grossProfitUgx.isNegative()
    ? 'negative'
    : 'positive'
  const netProfitTone = summary.totals.netProfitUgx.isNegative()
    ? 'negative'
    : 'positive'

  return (
    <div className="space-y-4">
      {routeDetails && (
        <Card>
          <CardHeader>
            <CardTitle>
              <ReviewLabel label="Route details" help="review.routeDetails" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Route"
                help="supplyRoute.name"
                value={routeDetails.name}
              />
              <Stat
                label="Route date"
                help="supplyRoute.departureDate"
                value={routeDetails.departureDate || 'Not set'}
              />
              <Stat
                label="Return date"
                help="supplyRoute.returnDate"
                value={routeDetails.returnDate || 'Not set'}
              />
              <Stat
                label="Budget"
                help="supplyRoute.budgetUsd"
                value={
                  routeDetails.budgetUsd
                    ? `${new BigNumber(routeDetails.budgetUsd).toFormat(2)} USD`
                    : 'Not set'
                }
              />
              <Stat
                label="UGX per USD"
                help="review.ugxPerUsd"
                value={routeDetails.rateUgxPerUsd
                  ? new BigNumber(routeDetails.rateUgxPerUsd).toFormat(0)
                  : 'Not set'}
              />
              <Stat
                label="RMB per USD"
                help="review.rmbPerUsd"
                value={routeDetails.rateRmbPerUsd
                  ? new BigNumber(routeDetails.rateRmbPerUsd).toFormat(2)
                  : 'Not set'}
              />
              <Stat
                label="Suppliers"
                help="review.suppliers"
                value={routeDetails.suppliers.join(', ') || 'None linked'}
              />
            </div>
            {routeDetails.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  <ReviewLabel label="Notes" help="supplyRoute.notes" />
                </p>
                <p className="mt-1 whitespace-pre-wrap">{routeDetails.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <ReviewLabel
              label="Route financial summary"
              help="review.financialSummary"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Units purchased"
              help="review.unitsPurchased"
              value={summary.totals.units.toLocaleString('en-UG')}
            />
            <Stat
              label="Purchase spend in RMB"
              help="review.purchaseSpendRmb"
              value={formatSourceAmount(summary.totals.sourceSpend.RMB, 'RMB')}
            />
            <Stat
              label="Purchase spend in USD"
              help="review.purchaseSpendUsd"
              value={formatSourceAmount(summary.totals.sourceSpend.USD, 'USD')}
            />
            <Stat
              label="Purchase spend in UGX"
              help="review.purchaseSpendUgx"
              value={formatSourceAmount(summary.totals.sourceSpend.UGX, 'UGX')}
            />
            <Stat
              label="Foreign purchase USD equivalent"
              help="review.foreignPurchaseUsdEquivalent"
              value={`${summary.totals.totalUsdEquivalent.toFormat(2)} USD`}
            />
            <Stat
              label="Item cost in UGX"
              help="kpi.itemCosts"
              value={formatUgxTotal(summary.totals.itemCostUgx)}
            />
            <Stat
              label="Route expenses in UGX"
              help="kpi.expenses"
              value={formatUgxTotal(summary.totals.expenseTotalUgx)}
            />
            <Stat
              label="Total cost in UGX"
              help="kpi.grandTotal"
              value={formatUgxTotal(summary.totals.totalCostUgx)}
            />
            <Stat
              label="Total selling value in UGX"
              help="review.totalSellingValue"
              value={formatUgxTotal(summary.totals.totalSellingValueUgx)}
            />
            <Stat
              label="Projected gross profit at minimum sell price"
              help="review.projectedGrossProfit"
              value={formatUgxTotal(summary.totals.grossProfitUgx)}
              tone={grossProfitTone}
            />
            <Stat
              label="Projected net profit at minimum sell price"
              help="review.projectedNetProfit"
              value={formatUgxTotal(summary.totals.netProfitUgx)}
              tone={netProfitTone}
            />
          </div>
          {summary.totals.missingExpenseConversions > 0 && (
            <p className="text-sm text-destructive">
              {summary.totals.missingExpenseConversions} foreign expense
              {summary.totals.missingExpenseConversions === 1 ? '' : 's'} need
              an exchange rate and are excluded from the normalized total.
            </p>
          )}
          {Object.keys(summary.totals.unsupportedSourceSpend).length > 0 && (
            <p className="text-sm text-destructive">
              Source spend in unsupported currencies is not included in the
              RMB/USD/UGX totals:{' '}
              {Object.entries(summary.totals.unsupportedSourceSpend)
                .map(([currency, amount]) =>
                  formatSourceAmount(amount, currency),
                )
                .join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <ReviewLabel
              label="Expense breakdown"
              help="review.expenseBreakdown"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(summary.totals.expenseByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expenses recorded yet.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(summary.totals.expenseByCategory).map(
                ([category, amount]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="capitalize">{category}</span>
                    <span className="font-mono font-semibold">
                      {formatUgxTotal(amount)}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <ReviewLabel
              label="Purchase details"
              help="review.purchaseDetails"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {itemGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items entered yet.
            </p>
          ) : (
            <Accordion
              type="multiple"
              value={openItemKeys}
              onValueChange={setOpenItemKeys}
              className="flex flex-col gap-2"
            >
              {itemGroups.map((group) => (
                <AccordionItem
                  key={group.key}
                  value={group.key}
                  className="rounded-lg border px-4 last:border"
                >
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">
                          {group.itemName}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                          {group.articleNumber}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
                        <span>{group.supplierNames.join(', ')}</span>
                        <span>{group.lines.length} variants</span>
                        {group.dates.length > 0 && (
                          <span>{group.dates.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-5 text-right sm:flex">
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">
                          Units
                        </p>
                        <p className="font-mono text-sm">{group.units}</p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">
                          Cost
                        </p>
                        <p className="font-mono text-sm">
                          {formatUgxTotal(group.itemCostUgx)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">
                          Selling total
                        </p>
                        <p className="font-mono text-sm">
                          {formatUgxTotal(group.sellingValueUgx)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-muted-foreground">
                          Gross profit
                        </p>
                        <p
                          className={cn(
                            'font-mono text-sm font-semibold',
                            group.grossProfitUgx.isNegative()
                              ? 'text-destructive'
                              : 'text-emerald-700 dark:text-emerald-400',
                          )}
                        >
                          {formatUgxTotal(group.grossProfitUgx)}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:hidden">
                      <div className="flex items-center justify-between">
                        <span>Units</span>
                        <span className="font-mono text-foreground">
                          {group.units}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Cost</span>
                        <span className="font-mono text-foreground">
                          {formatUgxTotal(group.itemCostUgx)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Selling total</span>
                        <span className="font-mono text-foreground">
                          {formatUgxTotal(group.sellingValueUgx)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Gross profit</span>
                        <span
                          className={cn(
                            'font-mono font-semibold',
                            group.grossProfitUgx.isNegative()
                              ? 'text-destructive'
                              : 'text-emerald-700 dark:text-emerald-400',
                          )}
                        >
                          {formatUgxTotal(group.grossProfitUgx)}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[1380px] text-xs">
                        <thead className="bg-muted/50 text-left text-muted-foreground">
                          <tr>
                            {purchaseReviewColumns.map(
                              ([heading, help], index) => (
                                <th
                                  key={heading}
                                  scope="col"
                                  className={cn(
                                    'px-2 py-2 font-medium',
                                    index > 2 && 'text-right',
                                  )}
                                >
                                  <ReviewLabel label={heading} help={help} />
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line, index) => (
                            <tr
                              key={`${line.articleNumber}-${line.colorName}-${line.size}-${index}`}
                              className="border-t align-top"
                            >
                              <td className="whitespace-nowrap px-2 py-2">
                                {line.date || '—'}
                              </td>
                              <td className="px-2 py-2">{line.supplierName}</td>
                              <td className="px-2 py-2">
                                {[line.colorName, line.size]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {formatRate(
                                  line.sourceCurrency,
                                  line.exchangeRateForeignToUsd,
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {line.quantity}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {formatSourceAmount(
                                  line.sourceUnitCost,
                                  line.sourceCurrency,
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {formatSourceAmount(
                                  line.sourceTotal,
                                  line.sourceCurrency,
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {line.totalAmountUsd
                                  ? `${line.totalAmountUsd.toFormat(2)} USD`
                                  : '—'}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {line.exchangeRateUsdToUgx
                                  ? line.exchangeRateUsdToUgx.toFormat(0)
                                  : '—'}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {formatUgx(line.landedCostUgx)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {line.minimumSellPriceUgx
                                  ? formatUgx(line.minimumSellPriceUgx)
                                  : '—'}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                                {formatUgx(line.sellingValueUgx)}
                              </td>
                              <td
                                className={cn(
                                  'whitespace-nowrap px-2 py-2 text-right font-mono font-semibold',
                                  line.grossProfitUgx.isNegative()
                                    ? 'text-destructive'
                                    : 'text-emerald-700 dark:text-emerald-400',
                                )}
                              >
                                {formatUgx(line.grossProfitUgx)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t bg-muted/50 font-semibold">
                          <tr>
                            <td className="px-2 py-2" colSpan={3}>
                              Item total
                            </td>
                            <td className="px-2 py-2 text-right">—</td>
                            <td className="px-2 py-2 text-right font-mono">
                              {group.units}
                            </td>
                            <td className="px-2 py-2 text-right">—</td>
                            <td className="px-2 py-2 text-right font-mono">
                              {formatGroupSourceSpend(group.lines)}
                            </td>
                            <td className="px-2 py-2 text-right">—</td>
                            <td className="px-2 py-2 text-right">—</td>
                            <td className="px-2 py-2 text-right font-mono">
                              {formatUgxTotal(group.itemCostUgx)}
                            </td>
                            <td className="px-2 py-2 text-right">—</td>
                            <td className="px-2 py-2 text-right font-mono">
                              {formatUgxTotal(group.sellingValueUgx)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono">
                              {formatUgxTotal(group.grossProfitUgx)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <ReviewLabel
              label="Recorded expenses"
              help="review.recordedExpenses"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expenses recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      <ReviewLabel label="Category" help="expense.category" />
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      <ReviewLabel
                        label="Description"
                        help="expense.description"
                      />
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      <ReviewLabel label="Amount" help="expense.amount" />
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      <ReviewLabel label="Rate" help="reviewCol.expenseRate" />
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      <ReviewLabel
                        label="Total UGX"
                        help="reviewCol.expenseTotalUgx"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.expenses.map((expense, index) => (
                    <tr
                      key={`${expense.category}-${index}`}
                      className="border-t"
                    >
                      <td className="px-3 py-2 capitalize">
                        {expense.category}
                      </td>
                      <td className="px-3 py-2">
                        {expense.description || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatSourceAmount(expense.amount, expense.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {expense.exchangeRate
                          ? expense.exchangeRate.toFormat(2)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {expense.convertedAmountUgx
                          ? formatUgx(expense.convertedAmountUgx)
                          : 'Conversion needed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
