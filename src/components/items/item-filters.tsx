import { Button } from '#/components/ui/button'
import { FieldLabel } from '#/components/ui/field-label'
import { Input } from '#/components/ui/input'

export type ItemFilterValues = {
  query: string
  includeArchived: boolean
  returnDateFrom: string
  returnDateTo: string
}

export function ItemFilters({
  filters,
  canManage,
  onFiltersChange,
}: {
  filters: ItemFilterValues
  canManage: boolean
  onFiltersChange: (filters: ItemFilterValues) => void
}) {
  const isReversed =
    !!filters.returnDateFrom &&
    !!filters.returnDateTo &&
    filters.returnDateFrom > filters.returnDateTo

  function update<TField extends keyof ItemFilterValues>(
    key: TField,
    value: ItemFilterValues[TField],
  ) {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <FieldLabel htmlFor="item-search">Search items</FieldLabel>
          <Input
            id="item-search"
            aria-label="Search by art number, design, or item name"
            placeholder="Search by art number, design, or item name…"
            value={filters.query}
            onChange={(event) => update('query', event.target.value)}
          />
        </div>
        <div className="w-44 space-y-1.5">
          <FieldLabel htmlFor="item-return-date-from">
            Return date from
          </FieldLabel>
          <Input
            id="item-return-date-from"
            type="date"
            aria-label="Return date from"
            value={filters.returnDateFrom}
            onChange={(event) => update('returnDateFrom', event.target.value)}
          />
        </div>
        <div className="w-44 space-y-1.5">
          <FieldLabel htmlFor="item-return-date-to">Return date to</FieldLabel>
          <Input
            id="item-return-date-to"
            type="date"
            aria-label="Return date to"
            value={filters.returnDateTo}
            onChange={(event) => update('returnDateTo', event.target.value)}
          />
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update('includeArchived', !filters.includeArchived)}
          >
            {filters.includeArchived ? 'Hide archived' : 'Search archived'}
          </Button>
        )}
      </div>
      {isReversed && (
        <p role="alert" className="text-sm text-destructive">
          Return date from must be on or before return date to
        </p>
      )}
    </div>
  )
}
