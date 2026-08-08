import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { requireUiPermission, useCan } from '#/lib/permissions'
import { listItems, searchItems } from '#/server/functions/items/items'
import { ItemCard } from '#/components/items/item-card'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/items/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'items.view'),
  loader: async () => ({ products: await listItems() }),
  component: ProductsPage,
})

function ProductsPage() {
  const { products: initial } = Route.useLoaderData()
  const canManage = useCan('items.manage')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(initial)
  const [showArchived, setShowArchived] = useState(false)

  async function handleSearch(value: string) {
    setQuery(value)
    setResults(
      await searchItems({
        data: { query: value, includeArchived: showArchived },
      }),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Items</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {results.length} item{results.length === 1 ? '' : 's'}
          </p>
          {canManage && (
            <Button asChild size="sm">
              <Link to="/items/new">
                <Plus className="mr-1 size-4" /> Create item
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by article or name…"
          value={query}
          onChange={(e) => {
            void handleSearch(e.target.value)
          }}
          className="max-w-md"
        />
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = !showArchived
              setShowArchived(next)
              void searchItems({
                data: { query, includeArchived: next },
              }).then(setResults)
            }}
          >
            {showArchived ? 'Hide archived' : 'Search archived'}
          </Button>
        )}
      </div>
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query
            ? 'No matching items.'
            : canManage
              ? 'No items yet. Create one above, or add one when recording a supply route.'
              : 'No items yet. Ask an admin to create one, or add one when recording a supply route.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((p) => (
            <ItemCard
              key={p.articleNumber}
              data={{
                articleNumber: p.articleNumber,
                name: p.name,
                archived: !!p.deletedAt,
                // Sizes used to live on items.sizes; after #7 they
                // derive from the variants array on the ItemCard side.
                variants: p.variants,
                colors: p.colors.map((c) => ({
                  id: c.id,
                  colorName: c.colorName,
                  colorHex: c.colorHex,
                  imageS3Key: c.imageS3Key,
                })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
