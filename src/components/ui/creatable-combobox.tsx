import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"

import { cn } from "#/lib/utils"
import { Button } from "#/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"

// Unique-by-construction value for the synthetic "Create…" row. Uses a
// null byte so it can never collide with a user-typed option (every
// upstream validator strips control characters).
const CREATE_SENTINEL = "\x00__create__"

interface CreatableComboboxProps {
  options: ReadonlyArray<string>
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: React.ReactNode
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean
  className?: string
  triggerClassName?: string
}

/**
 * Combobox variant that lets the user pick an existing option OR type a
 * new one and add it on the spot. When the typed query doesn't match any
 * option (case-insensitive, trimmed), a "Create '<query>'" row appears
 * at the top of the list — selecting it calls onChange(query.trim()).
 *
 * Built on the same Command + Popover primitives as ./combobox.tsx so
 * the visual treatment matches.
 */
function CreatableCombobox({
  options,
  value,
  onChange,
  placeholder = "Select or create...",
  searchPlaceholder = "Search or type to create...",
  emptyMessage = "No matches.",
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  className,
  triggerClassName,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const trimmed = query.trim()
  const exactMatch = options.some(
    (o) => o.toLowerCase() === trimmed.toLowerCase(),
  )
  const showCreate = trimmed.length > 0 && !exactMatch

  function select(next: string) {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid || undefined}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {value || placeholder}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-(--radix-popover-trigger-width) p-0", className)}
        align="start"
      >
        <Command
          // Always include the synthetic "create" row in the filtered list
          // even when query doesn't match any option — cmdk would otherwise
          // hide everything and show CommandEmpty instead.
          filter={(itemValue, search) => {
            if (itemValue === CREATE_SENTINEL) return 1
            return itemValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {showCreate && (
                <CommandItem
                  key={CREATE_SENTINEL}
                  value={CREATE_SENTINEL}
                  onSelect={() => select(trimmed)}
                >
                  <PlusIcon className="mr-2 size-4" />
                  Create &ldquo;{trimmed}&rdquo;
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => select(option)}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { CreatableCombobox }
