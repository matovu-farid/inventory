import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { listProducts, searchProducts } from "#/server/functions/products/products"
import { ProductCard } from "#/components/products/product-card"
import { Input } from "#/components/ui/input"

export const Route = createFileRoute("/items/")({
  // Either the new key (`items.view`) or its 90-day alias (`products.view`)
  // grants access — the permission helper normalizes both. See
  // src/lib/permissions.ts and the alias-policy notes in #3.
  beforeLoad: ({ context }) => requireUiPermission(context, "items.view"),
  loader: async () => ({ products: await listProducts() }),
  component: ProductsPage,
})

function ProductsPage() {
  const { products: initial } = Route.useLoaderData()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(initial)

  async function handleSearch(value: string) {
    setQuery(value)
    setResults(await searchProducts({ data: { query: value } }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-muted-foreground">
          {results.length} product{results.length === 1 ? "" : "s"}
        </p>
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
            ? "No matching products."
            : "No products yet. Add one when recording a supply route or opening balance."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((p) => (
            <ProductCard
              key={p.articleNumber}
              data={{
                articleNumber: p.articleNumber,
                name: p.name,
                sizes: p.sizes,
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
