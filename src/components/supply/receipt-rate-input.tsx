import { useEffect, useRef, useState } from 'react'
import BigNumber from 'bignumber.js'
import { Input } from '#/components/ui/input'

function unformat(value: string): string {
  return value.replace(/,/g, '').replace(/[^0-9.]/g, '')
}

function format(value: string, decimals: number): string {
  const raw = unformat(value)
  if (!raw) return ''
  const number = new BigNumber(raw)
  return number.isFinite() ? number.toFormat(decimals) : value
}

export function ReceiptRateInput({
  value,
  onChange,
  decimals = 2,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  decimals?: number
}) {
  const focused = useRef(false)
  const [draft, setDraft] = useState(() => format(value, decimals))

  useEffect(() => {
    if (!focused.current) setDraft(format(value, decimals))
  }, [value, decimals])

  return (
    <Input
      {...props}
      value={draft}
      inputMode="decimal"
      onFocus={() => {
        focused.current = true
        setDraft(unformat(value))
      }}
      onChange={(event) => {
        const next = unformat(event.target.value)
        setDraft(next)
        onChange(next)
      }}
      onBlur={() => {
        focused.current = false
        setDraft(format(draft, decimals))
      }}
    />
  )
}
