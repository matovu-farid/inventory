/**
 * Pure helper: given routes (with items) and the set of supply-route-item
 * IDs that already have a StoreReceiving record, return only routes that
 * still have ≥1 unreceived item. Empty-item routes are excluded.
 */
export function filterRoutesWithUnreceivedItems<
  TRoute extends { items: Array<{ id: string }> },
>(routes: TRoute[], receivedItemIds: ReadonlySet<string>): TRoute[] {
  return routes.filter(
    (r) =>
      r.items.length > 0 &&
      r.items.some((it) => !receivedItemIds.has(it.id)),
  )
}
