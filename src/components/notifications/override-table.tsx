import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { InfoTip } from "#/components/ui/info-tip"
import {
  upsertOverride,
  deleteOverride,
} from "#/server/functions/notifications/thresholds"

export interface OverrideRow {
  id: string
  scope: "store" | "shop"
  productColor: {
    id: string
    colorName: string
    product: { id: string; articleNumber: string; name: string }
  }
  size: string
  shopId: string | null
  shop: { id: string; name: string } | null
  mode: "percent" | "units"
  value: string
}

export function OverrideTable({
  rows,
  showShopColumn,
  productOptions,
  shopOptions,
  defaultShopId,
  onChanged,
}: {
  rows: OverrideRow[]
  showShopColumn: boolean
  productOptions: Array<{
    productColorId: string
    label: string
    sizes: string[]
  }>
  shopOptions?: Array<{ id: string; name: string }>
  defaultShopId?: string | null
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="flex items-center gap-1">
                Scope
                <InfoTip term="notifications.overrides.scope" />
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Product
                <InfoTip term="notifications.overrides.product" />
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Size
                <InfoTip term="notifications.overrides.size" />
              </span>
            </TableHead>
            {showShopColumn && <TableHead>Shop</TableHead>}
            <TableHead>
              <span className="flex items-center gap-1">
                Rule
                <InfoTip term="notifications.overrides.rule" />
              </span>
            </TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="capitalize">{r.scope}</TableCell>
              <TableCell>
                {r.productColor.product.articleNumber} {r.productColor.colorName}
              </TableCell>
              <TableCell>{r.size}</TableCell>
              {showShopColumn && (
                <TableCell>{r.shop?.name ?? "(all shops)"}</TableCell>
              )}
              <TableCell>
                {r.mode === "percent"
                  ? `≤ ${r.value}%`
                  : `≤ ${r.value} units`}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void deleteOverride({ data: { id: r.id } }).then(onChanged)
                  }}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showShopColumn ? 6 : 5}
                className="text-muted-foreground text-sm text-center"
              >
                No overrides yet — defaults apply to everything.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {adding ? (
        <AddOverrideForm
          showShopField={showShopColumn}
          productOptions={productOptions}
          shopOptions={shopOptions ?? []}
          defaultShopId={defaultShopId ?? null}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onChanged()
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add override
        </Button>
      )}
    </div>
  )
}

function AddOverrideForm({
  showShopField,
  productOptions,
  shopOptions,
  defaultShopId,
  onCancel,
  onSaved,
}: {
  showShopField: boolean
  productOptions: Array<{
    productColorId: string
    label: string
    sizes: string[]
  }>
  shopOptions: Array<{ id: string; name: string }>
  defaultShopId: string | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [scope, setScope] = useState<"store" | "shop">(
    showShopField ? "shop" : "store",
  )
  const [productColorId, setProductColorId] = useState(
    productOptions[0]?.productColorId ?? "",
  )
  const sizes =
    productOptions.find((p) => p.productColorId === productColorId)?.sizes ?? []
  const [size, setSize] = useState(sizes[0] ?? "")
  const [shopId, setShopId] = useState<string | null>(defaultShopId)
  const [mode, setMode] = useState<"percent" | "units">("percent")
  const [value, setValue] = useState("20")
  const [saving, setSaving] = useState(false)

  function handleProductColorChange(id: string) {
    setProductColorId(id)
    const newSizes =
      productOptions.find((p) => p.productColorId === id)?.sizes ?? []
    setSize(newSizes[0] ?? "")
  }

  async function onSubmit() {
    setSaving(true)
    try {
      await upsertOverride({
        data: {
          scope,
          productColorId,
          size,
          shopId: scope === "shop" ? shopId : null,
          mode,
          value: Number(value),
        },
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Scope</label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as typeof scope)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">Store</SelectItem>
              <SelectItem value="shop">Shop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Variant</label>
          <Select
            value={productColorId}
            onValueChange={handleProductColorChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productOptions.map((p) => (
                <SelectItem key={p.productColorId} value={p.productColorId}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showShopField && scope === "shop" && (
          <div>
            <label className="text-xs font-medium">Shop</label>
            <Select
              value={shopId ?? "ALL"}
              onValueChange={(v) => setShopId(v === "ALL" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All shops</SelectItem>
                {shopOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium">Mode</label>
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as typeof mode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percentage</SelectItem>
              <SelectItem value="units">Units</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Value</label>
          <Input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => { void onSubmit() }} disabled={saving}>
          {saving ? "Saving…" : "Save override"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
