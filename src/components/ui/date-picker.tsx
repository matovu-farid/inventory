import * as React from "react"
import { format, parse } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "#/lib/utils"
import { Button } from "#/components/ui/button"
import { Calendar } from "#/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"

interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  "aria-invalid"?: boolean
}

const ISO_FORMAT = "yyyy-MM-dd"

function parseValue(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, ISO_FORMAT, new Date())
  return isNaN(parsed.getTime()) ? undefined : parsed
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  id,
  name,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState<string>(value ?? "")

  React.useEffect(() => {
    if (value !== undefined) setInternalValue(value)
  }, [value])

  const currentValue = onChange ? value ?? "" : internalValue
  const date = parseValue(currentValue)

  function handleSelect(next: Date | undefined) {
    const formatted = next ? format(next, ISO_FORMAT) : ""
    if (onChange) onChange(formatted)
    else setInternalValue(formatted)
    setOpen(false)
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid || undefined}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="mr-2 size-4" />
            {date ? format(date, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </>
  )
}

export { DatePicker }
