export type SupplyRouteDisplayStatus =
  | 'open'
  | 'partially_received'
  | 'received'

export type ReceiptState = {
  receivedLineIds: ReadonlySet<string>
  totalLineIds: readonly string[]
}

export function deriveSupplyRouteDisplayStatus(
  state: ReceiptState,
): SupplyRouteDisplayStatus {
  if (
    state.totalLineIds.length > 0 &&
    state.receivedLineIds.size >= state.totalLineIds.length
  ) {
    return 'received'
  }

  if (state.receivedLineIds.size > 0) return 'partially_received'
  return 'open'
}

export function canEditSupplyRouteLine(input: {
  routeState: 'open' | 'received'
  received: boolean
}): boolean {
  return input.routeState === 'open' && !input.received
}

export function canEditSupplyRouteEntry(input: {
  routeState: 'open' | 'received'
  lineIds: readonly string[]
  receivedLineIds: ReadonlySet<string>
}): boolean {
  return (
    input.routeState === 'open' &&
    input.lineIds.every((lineId) => !input.receivedLineIds.has(lineId))
  )
}
