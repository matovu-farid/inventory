/**
 * Payment-method literals — single source of truth.
 *
 * Mirror of the `payment_method` Drizzle pgEnum in db/schema/sales.ts. Use
 * these together with the helpers below so the cash/bank → ledger mapping
 * lives in one place.
 */
export const PAYMENT_METHODS = ['cash', 'bank', 'credit'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type DepositLocation = 'cash' | 'bank'

/**
 * Ledger account name for a deposit by `method`.
 *
 * Cash → "Cash"; bank/credit → "Bank". Credit is included so callers don't
 * have to special-case it before computing the asset side of a refund/expense
 * journal entry — the caller still owns the decision of which side gets the
 * Accounts Receivable hit.
 */
export function depositCategoryFor(
  method: Extract<PaymentMethod, 'cash' | 'bank'>,
): 'Cash' | 'Bank' {
  return method === 'cash' ? 'Cash' : 'Bank'
}

/**
 * `depositLocation` enum value for a payment method, or `undefined` for
 * `"credit"` (which doesn't move cash and so has no deposit location).
 */
export function depositLocationFor(
  method: PaymentMethod,
): DepositLocation | undefined {
  if (method === 'cash') return 'cash'
  if (method === 'bank') return 'bank'
  return undefined
}
