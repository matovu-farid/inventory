import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Plus } from "lucide-react"
import { requireUiPermission, useCan } from "#/lib/permissions"
import {
  listItemCategories,
  listItems,
  searchItems,
} from "#/server/functions/items/items"
import { ItemCard } from "#/components/items/item-card"
import { ItemEditor } from "#/components/items/item-editor"
import { Input } from "#/components/ui/input"
import { Button } from "#/components/ui/button"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "#/components/ui/responsive-dialog"

export const Route = createFileRoute("/items/")({
  beforeLoad: ({ context }) => requireUiPermission(context, "items.view"),
  loader: async () => {
    const [products, categories] = await Promise.all([
      listItems(),
      listItemCategories(),
    ])
    return { products, categories }
  },
  component: ProductsPage,
})

function ProductsPage() {
  const { products: initial, categories } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan("items.manage")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(initial)
  const [editorOpen, setEditorOpen] = useState(false)

  async function handleSearch(value: string) {
    setQuery(value)
    setResults(await searchItems({ data: { query: value } }))
  }

  async function refreshList() {
    setResults(await searchItems({ data: { query } }))
    void router.invalidate()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Items</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {results.length} item{results.length === 1 ? "" : "s"}
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              <Plus className="mr-1 size-4" /> Create item
            </Button>
          )}
        </div>
      </div>
      <Input
        placeholder="Search by article or name…"
        value={query}
        onChange={(e) => { void handleSearch(e.target.value) }}
        className="max-w-md"
      />
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query
            ? "No matching items."
            : canManage
              ? "No items yet. Create one above, or add one when recording a supply route."
              : "No items yet. Ask an admin to create one, or add one when recording a supply route."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((p) => (
            <ItemCard
              key={p.articleNumber}
              data={{
                articleNumber: p.articleNumber,
                name: p.name,
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
          </DialogHeader>
          <ItemEditor
            categories={categories}
            onCreated={() => {
              setEditorOpen(false)
              void refreshList()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
