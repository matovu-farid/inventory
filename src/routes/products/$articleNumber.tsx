import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Plus } from "lucide-react"
import { requireUiPermission, useCan } from "#/lib/permissions"
import { getProductByArticle } from "#/server/functions/products/products"
import { ColorEditor } from "#/components/products/color-editor"
import { productImageUrl } from "#/lib/products"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"

export const Route = createFileRoute("/products/$articleNumber")({
  beforeLoad: ({ context }) => requireUiPermission(context, "products.view"),
  loader: async ({ params }) => {
    const product = await getProductByArticle({
      data: { articleNumber: params.articleNumber },
    })
    if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
    return { product }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { product } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan("products.manage")
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [activeColorId, setActiveColorId] = useState<string | undefined>(
    product.colors[0]?.id,
  )
  const active =
    product.colors.find((c) => c.id === activeColorId) ?? product.colors[0]

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-muted-foreground">
          {product.articleNumber}
        </p>
        <h1 className="text-2xl font-bold">{product.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="aspect-square rounded border bg-muted flex items-center justify-center overflow-hidden">
            {active?.imageS3Key ? (
              <img
                src={productImageUrl(active.imageS3Key)!}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="text-sm text-muted-foreground">no image</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {product.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveColorId(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs hover:bg-muted"
              >
                <span
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: c.colorHex }}
                  aria-hidden
                />
                {c.colorName}
              </button>
            ))}
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setColorDialogOpen(true)}
              >
                <Plus className="size-3 mr-1" /> Add color
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Sizes</h2>
            <p className="text-sm">{product.sizes.join(", ") || "—"}</p>
          </div>
          {product.description && (
            <div>
              <h2 className="font-medium">Description</h2>
              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add color</DialogTitle>
          </DialogHeader>
          <ColorEditor
            productId={product.id}
            onCreated={() => {
              setColorDialogOpen(false)
              router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
