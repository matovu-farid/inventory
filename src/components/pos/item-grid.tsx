import * as React from 'react'
import { ShoppingBag } from 'lucide-react'
import { itemImageUrl } from '#/lib/items'
import type { AggregatedItem } from '#/lib/items'

type Props = {
  items: AggregatedItem[]
  query: string
  onPick: (p: AggregatedItem) => void
}

export function ItemGrid({ items, query, onPick }: Props) {
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => {
      const a = p.item.articleNumber.toLowerCase()
      const n = p.item.name.toLowerCase()
      return a.includes(q) || n.includes(q)
    })
  }, [items, query])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <ShoppingBag className="size-8" strokeWidth={1.5} />
        <p className="text-sm">
          {query ? 'No items match.' : 'No stock in this shop.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {filtered.map((p) => {
        const colorsArr: AggregatedItem['colors'] = p.colors
        const firstColor = colorsArr.length > 0 ? colorsArr[0] : undefined
        const imgKey = firstColor?.imageS3Key ?? null
        const imgUrl = imgKey ? itemImageUrl(imgKey) : null
        return (
          <li key={p.item.articleNumber}>
            <button
              type="button"
              data-testid="item-card"
              onClick={() => onPick(p)}
              className="group block w-full overflow-hidden rounded-xl border bg-card text-left transition active:scale-[0.98]"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={p.item.name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="size-full"
                    style={{
                      background: `linear-gradient(135deg, ${firstColor?.colorHex ?? '#e5e7eb'}, #f5f5f5)`,
                    }}
                  />
                )}
                <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold">
                  {p.total}
                </div>
              </div>
              <div className="space-y-1 px-3 py-2">
                <p className="truncate text-sm font-semibold">{p.item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.item.articleNumber}
                </p>
                <div className="flex gap-1">
                  {p.colors.slice(0, 6).map((c) => (
                    <span
                      key={c.id}
                      className="size-3 rounded-full border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
