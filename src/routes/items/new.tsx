import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { requireUiPermission, useCan } from '#/lib/permissions'
import { searchItems } from '#/server/functions/items/items'
import { ItemEditor } from '#/components/items/item-editor'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/items/new')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'items.view'),
  loader: async () => {
    return {
      items: await searchItems({ data: { query: '', includeArchived: false } }),
    }
  },
  component: NewItemEntry,
})

function NewItemEntry() {
  const { items: initialItems } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan('items.manage')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState(initialItems)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    void searchItems({
      data: { query, includeArchived: false },
    }).then((nextItems) => {
      if (active) setItems(nextItems)
    })
    return () => {
      active = false
    }
  }, [query])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/items"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to items
        </Link>
        <p className="text-sm text-muted-foreground">Catalog item entry</p>
        <h1 className="text-2xl font-bold">Add an item</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select an item already in your catalog, or create a new one before
          adding it to a supply route.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select an existing item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search catalog items"
              className="pl-9"
              placeholder="Search by article number or name…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching items.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {items.map((item) => (
                <Link
                  key={item.id}
                  to="/items/$articleNumber"
                  params={{
                    articleNumber: item.articleNumbers[0]?.articleNumber ?? '',
                  }}
                  className="flex items-center justify-between gap-4 p-3 text-sm hover:bg-muted"
                >
                  <span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {item.articleNumbers
                        .map((number) => number.articleNumber)
                        .join(', ')}
                    </span>
                    <span className="font-medium">{item.name}</span>
                  </span>
                  <span className="text-muted-foreground">Open item →</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a new item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!creating ? (
              <Button type="button" onClick={() => setCreating(true)}>
                Create new item
              </Button>
            ) : (
              <ItemEditor
                onCreated={(_, articleNumber) => {
                  void router.navigate({
                    to: '/items/$articleNumber',
                    params: { articleNumber },
                  })
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
