import * as React from 'react'
import BigNumber from 'bignumber.js'
import { cn } from '#/lib/utils'

/**
 * Format a numeric string with thousand separators.
 * Preserves decimal portion if present.
 */
function formatWithCommas(value: string): string {
  if (!value) return ''
  const isNegative = value.startsWith('-')
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
  return isNegative ? `-${formatted}` : formatted
}

/** Strip commas to get the raw numeric value. */
function stripCommas(value: string): string {
  return value.replace(/,/g, '')
}

interface MoneyInputProps extends Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'value' | 'type'
> {
  /** Currency label shown as prefix, e.g. "UGX", "USD", "$" */
  currency?: string
  /** The raw numeric value (no commas) */
  value: string
  /** Called with the raw numeric string (no commas) */
  onChange: (value: string) => void
  /** Number of decimal places allowed. 0 = integers only. Default: 0 */
  decimals?: number
  /** Error message to display below the input */
  error?: string
  /** If set, on blur the value is floored to a multiple of this step (e.g. 50 for UGX). */
  roundTo?: number
}

function MoneyInput({
  className,
  currency,
  value,
  onChange,
  decimals = 0,
  error,
  roundTo,
  ...props
}: MoneyInputProps) {
  const [display, setDisplay] = React.useState(() => formatWithCommas(value))
  const displayRef = React.useRef(display)
  displayRef.current = display

  // Sync display when value changes externally
  React.useEffect(() => {
    const stripped = stripCommas(displayRef.current)
    if (stripped !== value) {
      setDisplay(formatWithCommas(value))
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,-]/g, '')
    const stripped = stripCommas(raw)

    // Normalise: at most one leading minus; drop any other minus signs
    const hasLeadingMinus = stripped.startsWith('-')
    const digits = stripped.replace(/-/g, '')
    const normalized = hasLeadingMinus ? `-${digits}` : digits

    // Validate: allow empty, or a partially-typed number
    if (normalized === '' || normalized === '-') {
      setDisplay(normalized)
      onChange(normalized === '-' ? '' : normalized)
      return
    }

    // Check decimal constraints
    if (decimals === 0 && normalized.includes('.')) return
    const parts = normalized.split('.')
    if (parts.length > 2) return // multiple dots
    if (parts[1] && parts[1].length > decimals) return

    // Check it's a valid partial number
    if (normalized !== '.' && normalized !== '-' && isNaN(Number(normalized))) {
      return
    }

    setDisplay(formatWithCommas(normalized))
    onChange(normalized)
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    // Strip a trailing dot left over from partial input
    const raw = display.endsWith('.') ? display.slice(0, -1) : display
    let stripped = stripCommas(raw)

    if (roundTo && stripped !== '' && stripped !== '-') {
      const bn = new BigNumber(stripped)
      if (!bn.isNaN()) {
        const sign = bn.isNegative() ? -1 : 1
        const step = new BigNumber(roundTo)
        const floored = bn.abs().idiv(step).times(step).times(sign)
        stripped = floored.toFixed(0)
      }
    }

    if (stripped !== stripCommas(display)) {
      setDisplay(formatWithCommas(stripped))
      onChange(stripped)
    }
    props.onBlur?.(e)
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          error &&
            'border-destructive ring-destructive/20 dark:ring-destructive/40',
          props.disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {currency && (
          <span className="flex items-center pl-3 text-sm font-medium text-muted-foreground select-none">
            {currency}
          </span>
        )}
        <input
          {...props}
          type="text"
          inputMode="decimal"
          aria-invalid={!!error || undefined}
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(
            'h-full w-full min-w-0 bg-transparent px-3 py-1 text-base text-right font-mono outline-none placeholder:text-muted-foreground disabled:pointer-events-none md:text-sm',
            !currency && 'pl-3',
            currency && 'pl-2',
          )}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Simpler variant for exchange rate inputs.
 * Shows a descriptive label pair like "RMB / USD" as prefix.
 */
interface RateInputProps extends Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'value' | 'type'
> {
  /** Label shown as prefix, e.g. "RMB/USD" */
  label?: string
  value: string
  onChange: (value: string) => void
  /** Number of decimal places. Default: 6 for exchange rates */
  decimals?: number
  error?: string
}

function RateInput({
  className,
  label,
  value,
  onChange,
  decimals = 6,
  error,
  ...props
}: RateInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')

    if (raw === '') {
      onChange('')
      return
    }

    const parts = raw.split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > decimals) return
    if (raw !== '.' && isNaN(Number(raw))) return

    onChange(raw)
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          error &&
            'border-destructive ring-destructive/20 dark:ring-destructive/40',
          props.disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {label && (
          <span className="flex items-center pl-3 text-xs font-medium text-muted-foreground select-none whitespace-nowrap">
            {label}
          </span>
        )}
        <input
          {...props}
          type="text"
          inputMode="decimal"
          aria-invalid={!!error || undefined}
          value={value}
          onChange={handleChange}
          className="h-full w-full min-w-0 bg-transparent px-3 py-1 text-base text-right font-mono outline-none placeholder:text-muted-foreground disabled:pointer-events-none md:text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { MoneyInput, RateInput }
