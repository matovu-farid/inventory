import { useRef, useState } from 'react'
import { ItemCard } from '#/components/items/item-card'
import { ItemFilters } from '#/components/items/item-filters'
import type { ItemFilterValues } from '#/components/items/item-filters'

export type ItemListRow = {
  id: string
  articleNumber: string
  name: string
  deletedAt: Date | null
  variants: Array<{ id: string; colorId: string; size: string }>
  colors: Array<{
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
  }>
}

const EMPTY_FILTERS: ItemFilterValues = {
  query: '',
  includeArchived: false,
  returnDateFrom: '',
  returnDateTo: '',
}

export function ItemsPageContent({
  initial,
  canManage,
  loadItems,
}: {
  initial: ItemListRow[]
  canManage: boolean
  loadItems: (filters: ItemFilterValues) => Promise<ItemListRow[]>
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [results, setResults] = useState(initial)
  const requestId = useRef(0)

  async function handleFiltersChange(nextFilters: ItemFilterValues) {
    setFilters(nextFilters)
    const currentRequestId = ++requestId.current
    const isReversed =
      !!nextFilters.returnDateFrom &&
      !!nextFilters.returnDateTo &&
      nextFilters.returnDateFrom > nextFilters.returnDateTo
    if (isReversed) return

    const nextResults = await loadItems(nextFilters)
    if (currentRequestId === requestId.current) setResults(nextResults)
  }

  const hasActiveFilter =
    !!filters.query.trim() ||
    filters.includeArchived ||
    !!filters.returnDateFrom ||
    !!filters.returnDateTo

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {results.length} item{results.length === 1 ? '' : 's'}
      </p>
      <ItemFilters
        filters={filters}
        canManage={canManage}
        onFiltersChange={(next) => void handleFiltersChange(next)}
      />
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasActiveFilter
            ? 'No matching items.'
            : canManage
              ? 'No items yet. Create one above, or add one when recording a supply route.'
              : 'No items yet. Ask an admin to create one, or add one when recording a supply route.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((item) => (
            <ItemCard
              key={item.articleNumber}
              data={{
                articleNumber: item.articleNumber,
                name: item.name,
                archived: !!item.deletedAt,
                variants: item.variants,
                colors: item.colors,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export { EMPTY_FILTERS }
