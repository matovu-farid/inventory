/**
 * Credit-sale payment statuses — single source of truth.
 *
 * Mirror of the `payment_status` Drizzle pgEnum in db/schema/sales.ts. Use
 * these constants in Zod schemas, status checks, and `inArray()` queries so
 * the literal strings live in one place.
 */
export const PAYMENT_STATUSES = [
  'settled',
  'open',
  'partially_paid',
  'written_off',
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Statuses that still owe money — useful for filtering open A/R. */
export const OPEN_PAYMENT_STATUSES = ['open', 'partially_paid'] as const

export function isPaymentStatusOpen(status: PaymentStatus): boolean {
  return (OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status)
}
