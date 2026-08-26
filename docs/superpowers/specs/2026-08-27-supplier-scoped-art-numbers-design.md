# Supplier-scoped art numbers design

## Goal

Make supplier art numbers easy to enter and search while giving every stored art number a globally unique internal identity. Users continue entering the supplier's visible number, such as `JACKET 101`; the system qualifies it with that supplier's generated code.

## Decisions

- Every supplier has one immutable eight-letter uppercase code.
- Codes are generated from a secure random alphabet and protected by a unique database constraint. A collision retries inside the same transaction.
- Existing suppliers receive codes during the migration. Because the application is pre-production, the migration may backfill the current catalog in place.
- `item_article_numbers.article_number` remains the normalized supplier-facing value.
- `item_article_numbers.qualified_article_number` stores `<supplier-code>:<normalized-art-number>` and is globally unique.
- The supplier relationship for an article number is the supplier relationship of its item; the qualified value is generated whenever an article number is created or changed.
- The receipt grid adds an editable `Item name` column before `Design`. Item name is the broad category (`Shirt`); design is the specific style (`Round neck`). Selecting an existing catalog item fills both; older/free-text rows fall back to the design when item name is omitted.

## Search behavior

Receipt catalog search requires a selected supplier and returns only active items belonging to that supplier. It ranks results in this order:

1. Exact article-number match.
2. Prefix article-number match.
3. Partial article-number match.
4. Exact design match.
5. Prefix design match.
6. Partial design match.

The item name is displayed in each result as context and is used as a final tie-breaker, but does not outrank art-number or design matches. An empty supplier selection produces no catalog search request.

## Persistence behavior

- A selected existing catalog item reuses its item id and existing article-number mapping.
- A new art number for the same supplier/item creates another article-number row with the same supplier code prefix.
- The same visible art number may exist for different suppliers because its qualified values differ.
- The same visible art number may not belong to two different items for the same supplier.
- A free-text row creates an item with its entered item name, design, supplier, and qualified art number.
- Receipt line snapshots retain the visible item name, design, and art number so review/history remains readable even if catalog records change.

## Compatibility

Existing item, stock, sales, review, and receipt screens continue displaying the raw `article_number`; the qualified value is an internal identity and is not exposed in normal UI. Existing item search receives an optional supplier filter without changing behavior for callers that do not provide one.

Item detail navigation uses the qualified article number (or item id) as its internal route key, so two suppliers may use the same visible number without linking to the wrong item. The rendered labels and links still show the visible number.

## Error handling

- Missing supplier prevents catalog searching and receipt save as it does today.
- Duplicate raw art numbers for the selected supplier produce a clear same-supplier ownership error naming the existing item/design.
- A raw art number owned by another supplier is no longer treated as a conflict when the selected supplier differs.
- Database uniqueness races are converted into the same ownership error after re-reading the conflicting row.
- A missing supplier code is a server error; no article number is written without a qualified value.

## Verification

Automated coverage will verify code generation, existing-supplier backfill, qualified-number uniqueness across suppliers, same-supplier conflict handling, supplier-scoped/ranked search, item-name/design receipt creation, and compatibility formatting. Browser testing will enter a supplier, search by art number and design, select a result, create a free-text row, save, and confirm the review page shows item name, design, raw art number, supplier, quantities, and amounts correctly.
