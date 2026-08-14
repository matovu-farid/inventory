import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { requireUiPermission, useCan } from '#/lib/permissions'
import { listItems, searchItems } from '#/server/functions/items/items'
import { Button } from '#/components/ui/button'
import { ItemsPageContent } from '#/components/items/items-page-content'
import type { ItemFilterValues } from '#/components/items/item-filters'

export const Route = createFileRoute('/items/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'items.view'),
  loader: async () => ({ products: await listItems() }),
  component: ProductsPage,
})

export async function loadItemResults(filters: ItemFilterValues) {
  const datePayload = {
    includeArchived: filters.includeArchived,
    returnDateFrom: filters.returnDateFrom || undefined,
    returnDateTo: filters.returnDateTo || undefined,
  }

  if (filters.query.trim()) {
    return searchItems({
      data: { query: filters.query, ...datePayload },
    })
  }

  if (filters.returnDateFrom || filters.returnDateTo) {
    return listItems({ data: datePayload })
  }

  return searchItems({ data: { query: '', ...datePayload } })
}

function ProductsPage() {
  const { products: initial } = Route.useLoaderData()
  const canManage = useCan('items.manage')

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Items</h1>
        {canManage && (
          <Button asChild size="sm">
            <Link to="/items/new">
              <Plus className="mr-1 size-4" /> Create item
            </Link>
          </Button>
        )}
      </div>
      <ItemsPageContent
        initial={initial}
        canManage={canManage}
        loadItems={loadItemResults}
      />
    </div>
  )
}
