export interface RouteSupplierSummary {
  id: string
  name: string
}

export function getDistinctRouteSuppliers(
  lines: ReadonlyArray<{
    supplier: RouteSupplierSummary
  }>,
): RouteSupplierSummary[] {
  const seen = new Set<string>()
  const result: RouteSupplierSummary[] = []
  for (const line of lines) {
    if (seen.has(line.supplier.id)) continue
    seen.add(line.supplier.id)
    result.push({ id: line.supplier.id, name: line.supplier.name })
  }
  return result
}
