import { Link } from '@tanstack/react-router'
import { itemImageUrl } from '#/lib/items'
import { deriveSizes } from '#/lib/variants'
import type { VariantLike } from '#/lib/variants'
import { cn } from '#/lib/utils'

interface ItemCardData {
  articleNumber: string
  name: string
  variants: VariantLike[]
  colors: Array<{
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
  }>
  totalQuantity?: number
  locationCounts?: Array<{ label: string; qty: number }>
}

export function ItemCard({
  data,
  className,
}: {
  data: ItemCardData
  className?: string
}) {
  const primaryImage = data.colors.find((c) => c.imageS3Key)?.imageS3Key
  const sizes = deriveSizes(data.variants)
  return (
    <Link
      to="/items/$articleNumber"
      params={{ articleNumber: data.articleNumber }}
      className={cn(
        'flex gap-3 rounded-lg border p-3 hover:bg-muted/40 transition',
        className,
      )}
    >
      <div className="size-24 shrink-0 rounded-md border bg-muted overflow-hidden flex items-center justify-center">
        {primaryImage ? (
          <img
            src={itemImageUrl(primaryImage)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xs text-muted-foreground">no image</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {data.articleNumber}
          </span>
          <span className="font-medium truncate">{data.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.colors.map((c) => (
            <span
              key={c.id}
              aria-label={c.colorName}
              title={c.colorName}
              className="inline-block size-3 rounded-full border"
              style={{ backgroundColor: c.colorHex }}
            />
          ))}
        </div>
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Available sizes">
            {sizes.map((s) => (
              <span
                key={s}
                className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded border bg-muted/40 px-1 text-[10px] font-medium text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {typeof data.totalQuantity === 'number' && (
          <p className="text-sm">
            <span className="font-semibold">{data.totalQuantity}</span>
            <span className="text-muted-foreground"> in stock</span>
            {data.locationCounts && data.locationCounts.length > 0 && (
              <span className="text-muted-foreground">
                {' · '}
                {data.locationCounts
                  .map((l) => `${l.label}: ${l.qty}`)
                  .join(' · ')}
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  )
}
