export function resolveDefaultPurchaseSupplierId({
  itemSupplierId,
  routeSupplierIds,
  existingEntrySupplierId,
}: {
  itemSupplierId?: string | null
  routeSupplierIds: ReadonlyArray<string>
  existingEntrySupplierId?: string | null
}) {
  if (existingEntrySupplierId) return existingEntrySupplierId
  if (itemSupplierId && routeSupplierIds.includes(itemSupplierId)) {
    return itemSupplierId
  }
  return routeSupplierIds.length > 0
    ? routeSupplierIds[0]
    : (itemSupplierId ?? '')
}
