export function resolveDefaultPurchaseSupplierId({
  itemSupplierId,
  supplierIds,
  existingEntrySupplierId,
}: {
  itemSupplierId?: string | null
  supplierIds: ReadonlyArray<string>
  existingEntrySupplierId?: string | null
}) {
  if (existingEntrySupplierId) return existingEntrySupplierId
  return itemSupplierId ?? supplierIds.at(0) ?? ''
}
