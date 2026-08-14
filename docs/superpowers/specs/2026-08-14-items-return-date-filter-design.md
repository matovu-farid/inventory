# Items Return-Date Filter Design

## Goal

Allow users on the Items page to find items that appeared on supply routes returned during a selected date period. The filter uses the supply route's `returnDate`, not an item's creation date or a line's creation timestamp.

## User experience

- The Items page keeps its existing article-number/name search and archived-item controls.
- Add two optional date controls to the same filter area: `Return date from` and `Return date to`.
- Date boundaries are inclusive. A route returned on either selected boundary date matches.
- Either boundary may be used alone:
  - only `from`: routes returned on or after that date;
  - only `to`: routes returned on or before that date.
- With neither date selected, behavior remains the current item search/list behavior.
- If `from` is later than `to`, display a validation message and do not run a server search.
- Routes with a null `returnDate` do not match when either date filter is active.
- The item count and empty-state message reflect the combined text, archived, and date filters.

## Data flow and architecture

1. The Items route owns the current text query, archive toggle, and date-boundary state.
2. Changing any filter invokes the existing server-function path with the complete filter state.
3. The server validates optional ISO calendar-date strings and passes them to the item query helper.
4. The item query combines:
   - the existing active/archived condition;
   - the existing article-number/name text condition;
   - an `EXISTS`/join condition through `supplyRouteLines` to `supplyRoutes` for the selected return-date bounds.
5. Results remain distinct items ordered by article number and hydrated with the existing item detail relations.

Date comparisons operate on PostgreSQL `date` values directly. The implementation must not convert these boundaries through JavaScript `Date` objects, avoiding timezone-related off-by-one errors.

## API shape

Extend the item list/search input with optional fields:

```ts
{
  query: string
  includeArchived?: boolean
  returnDateFrom?: string
  returnDateTo?: string
}
```

The list endpoint may accept the same optional date fields so the initial loader and subsequent searches share one filtering contract. The query helper validates the relationship `returnDateFrom <= returnDateTo` at the input boundary or through the shared route validation used by the UI.

## Error handling

- Invalid calendar-date input is rejected by the server input schema.
- A reversed range is rejected before querying; the UI should present an inline, actionable message.
- Clearing either date removes only that boundary and refreshes results using the remaining filters.
- No new behavior is required for database or network failures; existing server-function error handling remains in place.

## Testing

Add focused query tests covering:

- a route return date inside the range matches its item;
- both range boundaries are inclusive;
- open/null-return-date routes do not match an active date filter;
- only-from and only-to filters work;
- text search, archived filtering, and date filtering compose correctly;
- an item associated with multiple matching route lines is returned once;
- no date filters preserve existing results.

Add a focused Items-page component test covering the two date controls, combined filter submission, reversed-range validation, and the filtered empty state/count where the current test setup permits.

## Scope and non-goals

This change is limited to filtering the Items page by supply-route return date. It does not change route data, item ownership, route detail screens, reporting, pagination, or the meaning of existing text/archive filters.
