import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { InfoTip } from '#/components/ui/info-tip'
import {
  upsertOverride,
  deleteOverride,
} from '#/server/functions/notifications/thresholds'

/**
 * Per-variant override row as returned by `listOverrides`. The relational
 * query traverses `variant → item / color` so the row carries enough catalog
 * data to render item + color + size in the table.
 */
export interface OverrideRow {
  id: string
  scope: 'store' | 'shop'
  variantId: string
  variant: {
    id: string
    size: string
    item: { id: string; articleNumber: string; name: string }
    color: { id: string; colorName: string }
  }
  shopId: string | null
  shop: { id: string; name: string } | null
  mode: 'percent' | 'units'
  value: string
}

/** A variant the override-form dropdown can pick from. */
export interface VariantOption {
  variantId: string
  /** Article + color label, e.g. "SH-2045 · Black". */
  label: string
  size: string
}

export function OverrideTable({
  rows,
  showShopColumn,
  variantOptions,
  shopOptions,
  defaultShopId,
  onChanged,
}: {
  rows: OverrideRow[]
  showShopColumn: boolean
  variantOptions: VariantOption[]
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
                Item
                <InfoTip term="notifications.overrides.item" />
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Color
                <InfoTip term="notifications.overrides.item" />
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
              <TableCell>{r.variant.item.articleNumber}</TableCell>
              <TableCell>{r.variant.color.colorName}</TableCell>
              <TableCell>{r.variant.size}</TableCell>
              {showShopColumn && (
                <TableCell>{r.shop?.name ?? '(all shops)'}</TableCell>
              )}
              <TableCell>
                {r.mode === 'percent' ? `≤ ${r.value}%` : `≤ ${r.value} units`}
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
                colSpan={showShopColumn ? 7 : 6}
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
          variantOptions={variantOptions}
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
  variantOptions,
  shopOptions,
  defaultShopId,
  onCancel,
  onSaved,
}: {
  showShopField: boolean
  variantOptions: VariantOption[]
  shopOptions: Array<{ id: string; name: string }>
  defaultShopId: string | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [scope, setScope] = useState<'store' | 'shop'>(
    showShopField ? 'shop' : 'store',
  )
  const [variantId, setVariantId] = useState(variantOptions[0]?.variantId ?? '')
  const [shopId, setShopId] = useState<string | null>(defaultShopId)
  const [mode, setMode] = useState<'percent' | 'units'>('percent')
  const [value, setValue] = useState('20')
  const [saving, setSaving] = useState(false)

  async function onSubmit() {
    setSaving(true)
    try {
      await upsertOverride({
        data: {
          scope,
          variantId,
          shopId: scope === 'shop' ? shopId : null,
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
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variantOptions.map((v) => (
                <SelectItem key={v.variantId} value={v.variantId}>
                  {v.label} · {v.size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showShopField && scope === 'shop' && (
          <div>
            <label className="text-xs font-medium">Shop</label>
            <Select
              value={shopId ?? 'ALL'}
              onValueChange={(v) => setShopId(v === 'ALL' ? null : v)}
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
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
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
        <Button
          onClick={() => {
            void onSubmit()
          }}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save override'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
