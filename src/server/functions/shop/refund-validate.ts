import BigNumber from "bignumber.js"

export interface ValidateCreditAdjustmentRefundInput {
  totalRefund: string
  outstandingBalance: string
}

/**
 * Guard a credit_adjustment refund: the refund amount must not exceed the
 * customer's outstanding balance on the original sale. Otherwise the ledger
 * over-credits A/R while the balance update clamps to zero, leaving the
 * customer with a phantom positive balance.
 *
 * Throws when totalRefund > outstandingBalance, including both numbers in
 * the message. Equality is allowed.
 */
export function validateCreditAdjustmentRefund(
  input: ValidateCreditAdjustmentRefundInput,
): void {
  const refund = new BigNumber(input.totalRefund)
  const balance = new BigNumber(input.outstandingBalance)
  if (refund.gt(balance)) {
    throw new Error(
      `validateCreditAdjustmentRefund: refund (${input.totalRefund}) exceeds outstanding balance (${input.outstandingBalance})`,
    )
  }
}
