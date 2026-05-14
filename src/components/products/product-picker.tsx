import { useEffect, useState } from "react"
import { searchProducts } from "#/server/functions/products/products"
import { Combobox  } from "#/components/ui/combobox"
import type {ComboboxOption} from "#/components/ui/combobox";

export interface ProductSummary {
  id: string
  articleNumber: string
  name: string
  sizes: string[]
  colors: Array<{ id: string; colorName: string; colorHex: string; imageS3Key: string | null }>
}

interface Props {
  value?: string
  onChange: (productId: string, product: ProductSummary | undefined) => void
  onCreateNew?: () => void
}

export function ProductPicker({ value, onChange, onCreateNew }: Props) {
  const [results, setResults] = useState<ProductSummary[]>([])

  useEffect(() => {
    void searchProducts({ data: { query: "" } }).then((rs) => setResults(rs as ProductSummary[]))
  }, [])

  const options: ComboboxOption[] = results.map((p) => ({
    value: p.id, label: `${p.articleNumber} — ${p.name}`,
  }))

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(id) => onChange(id, results.find((r) => r.id === id))}
        placeholder="Select product…"
        searchPlaceholder="Type article number…"
        emptyMessage={
          <div className="p-2 text-sm">
            No matching product.{" "}
            {onCreateNew && (
              <button type="button" onClick={onCreateNew} className="font-medium underline">
                Create new
              </button>
            )}
          </div>
        }
      />
    </div>
  )
}
