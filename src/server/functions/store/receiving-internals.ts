/**
 * Pure helper: given routes (with items) and the set of supply-route-item
 * IDs that already have a StoreReceiving record, return only routes that
 * still have ≥1 unreceived item. Empty-item routes are excluded.
 */
export function filterRoutesWithUnreceivedItems<
  R extends { items: Array<{ id: string }> },
>(routes: R[], receivedItemIds: ReadonlySet<string>): R[] {
  return routes.filter(
    (r) =>
      r.items.length > 0 &&
      r.items.some((it) => !receivedItemIds.has(it.id)),
  )
}
