import * as React from 'react'
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react'

import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'

export type ComboboxOption = {
  value: string
  label: string
}

const CREATE_SENTINEL = '\x00__create__'

interface ComboboxProps {
  options: ReadonlyArray<ComboboxOption>
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: React.ReactNode
  className?: string
  triggerClassName?: string
  disabled?: boolean
  onCreateNew?: (value: string) => void
  id?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
  onSearchChange?: (query: string) => void
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  triggerClassName,
  disabled,
  onCreateNew,
  id,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  onSearchChange,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const selected = options.find((o) => o.value === value)
  const trimmedQuery = query.trim()
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === trimmedQuery.toLowerCase(),
  )
  const showCreate = !!onCreateNew && trimmedQuery.length > 0 && !exactMatch

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-(--radix-popover-trigger-width) p-0', className)}
        align="start"
      >
        <Command
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
            onValueChange={(nextQuery) => {
              setQuery(nextQuery)
              onSearchChange?.(nextQuery)
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {showCreate && (
                <CommandItem
                  value={CREATE_SENTINEL}
                  onSelect={() => {
                    onCreateNew(trimmedQuery)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <PlusIcon className="mr-2 size-4" />
                  Create &ldquo;{trimmedQuery}&rdquo;
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <CheckIcon
                    className={cn(
                      'mr-2 size-4',
                      value === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
