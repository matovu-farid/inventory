import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

interface Props {
  shops: Array<{ id: string; name: string }>
  value: string
  onChange: (id: string) => void
}

export function ShopPicker({ shops, value, onChange }: Props) {
  if (shops.length <= 1) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Pick shop" />
      </SelectTrigger>
      <SelectContent>
        {shops.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
