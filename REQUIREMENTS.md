# Technical Requirements Document: Inventory & Trade Management System

**Version:** 1.0
**Date:** 2026-04-21
**Status:** Draft

---

## 1. Executive Summary

A multi-module inventory and trade management system for a clothing import/retail business. The system tracks the complete lifecycle of goods from international or local procurement, through warehousing, to retail sales across multiple shops. It implements double-entry bookkeeping with a shared ledger to ensure financial integrity and loss detection at every stage of the supply chain.

The system is divided into three specialized applications sharing a common database and accounting layer:

1. **Supply App** - Procurement and import cost tracking
2. **Store App** - Warehouse management, stock control, and distribution
3. **Shop App** - Retail sales, pricing, and point-of-sale

---

## 2. Business Context

### 2.1 Current Process (from Excel Analysis)

The business currently tracks operations in a spreadsheet (`gross_profit.xlsx`) spanning 47 trade routes from 2011-2026. Each route represents a buying trip, typically to China, recording:

- Item-level purchases (product type, quantity, unit price in RMB)
- Currency conversions: RMB -> USD -> UGX (Ugandan Shillings)
- Expense breakdowns: freight, tickets, expenses, rent, salary, tax
- Gross and net profit per route

### 2.2 Core Business Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   SUPPLIER   │     │   TRANSIT    │     │    STORE     │     │    SHOPS     │
│              │     │              │     │  (Warehouse) │     │  (1..many)   │
│ - Local      │────>│ - Freight    │────>│              │────>│              │
│ - Int'l      │     │ - Shipping   │     │ - Stock In   │     │ - Sell above │
│   (China)    │     │ - Customs    │     │ - Stock Out  │     │   min price  │
│              │     │ - Insurance  │     │ - Stock Take │     │ - Stock Take │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                        LOSS DETECTION AT EVERY POINT
```

---

## 3. System Architecture

### 3.1 Application Modules

The system consists of three specialized front-end applications served from a single codebase, sharing a common database and accounting engine:

| Module     | Primary Users               | Core Responsibility                                        |
| ---------- | --------------------------- | ---------------------------------------------------------- |
| **Supply** | Admin, Supervisor           | Procurement, supplier management, import cost tracking     |
| **Store**  | Admin, Supervisor           | Warehouse management, stock control, distribution to shops |
| **Shop**   | Sales Personnel, Supervisor | Retail sales, pricing, daily accounts                      |

### 3.2 Tech Stack

Based on the existing project scaffold:

- **Framework:** TanStack Start (full-stack React with SSR)
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** Better Auth (email/password, role-based)
- **UI:** shadcn/ui + Radix UI + Tailwind CSS v4
- **Deployment:** Cloudflare Workers
- **Monitoring:** Sentry
- **Accounting:** Double-entry ledger (modeled after the money-lending reference project)
- **Precision arithmetic:** BigNumber.js or Decimal.js for all monetary calculations

### 3.3 Shared Infrastructure

- **Single PostgreSQL database** across all modules
- **Shared double-entry ledger** for all financial transactions
- **Shared authentication** with role-based access control
- **Common accounting service layer** ensuring consistency

---

## 4. Domain Model

### 4.1 Core Entities

#### 4.1.1 Suppliers

```
Supplier
├── id: UUID
├── name: TEXT
├── type: ENUM ["local", "international"]
├── country: TEXT (e.g., "China", "Uganda")
├── contactName: TEXT
├── contactPhone: TEXT
├── contactEmail: TEXT (optional)
├── address: TEXT (optional)
├── notes: TEXT (optional)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.2 Supply Routes (Buying Trips)

A supply route represents a single procurement event - a buying trip to China or a purchase from a local supplier. A single route can involve **multiple suppliers**.

```
SupplyRouteSupplier (junction table)
├── id: UUID
├── supplyRouteId: FK -> SupplyRoute
├── supplierId: FK -> Supplier
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

```
SupplyRoute
├── id: UUID
├── name: TEXT (e.g., "46th Route", "Jan 2026")
├── status: ENUM ["planning", "purchasing", "in_transit", "received", "completed"]
├── departureDate: DATE (nullable, international only)
├── returnDate: DATE (nullable, international only)
├── budgetUsd: NUMERIC(15,2) (budget taken for the trip)
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.3 Supply Route Items (Line Items)

Individual products purchased on a route.

```
SupplyRouteItem
├── id: UUID
├── supplyRouteId: FK -> SupplyRoute
├── supplierId: FK -> Supplier (which supplier this item was purchased from)
├── productName: TEXT (freeform entry with autocomplete from previously used names)
├── articleNumber: TEXT (optional, product code)
├── quantity: INTEGER
├── unitPriceForeign: NUMERIC(15,2) (price in purchase currency)
├── foreignCurrency: TEXT (e.g., "RMB", "BHT", "UGX")
├── exchangeRateForeignToUsd: NUMERIC(10,6) (nullable, not needed when currency is UGX)
├── exchangeRateUsdToUgx: NUMERIC(10,2) (nullable, not needed when currency is UGX)
├── totalAmountForeign: NUMERIC(15,2) (computed: qty * unitPriceForeign)
├── totalAmountUsd: NUMERIC(15,2) (computed: totalAmountForeign / exchangeRateForeignToUsd)
├── totalCostUgx: NUMERIC(15,2) (computed: unitPriceForeign / exchangeRateForeignToUsd * exchangeRateUsdToUgx * qty)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.4 Supply Route Expenses

Costs associated with a supply route beyond item costs.

```
SupplyRouteExpense
├── id: UUID
├── supplyRouteId: FK -> SupplyRoute
├── category: ENUM ["freight", "shipping", "customs", "ticket", "transportation",
│                    "insurance", "rent", "salary", "tax", "miscellaneous"]
├── description: TEXT
├── amount: NUMERIC(15,2) (in UGX)
├── currency: TEXT (original currency if different)
├── exchangeRate: NUMERIC(10,6) (if converted)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Note:** For local suppliers, relevant expense categories are primarily `transportation`. For international suppliers, categories include `freight`, `shipping`, `customs`, `ticket`, `insurance`, and others.

**Cost Allocation:** Route-level expenses are tracked as lump-sum totals per route. They are **not** allocated to individual items. Profitability is assessed at the route level (total revenue minus total item costs minus total route expenses).

**Ledger Location:** All route expenses are posted to the ledger under the **store** location, since the store bears all procurement costs.

#### 4.1.5 Store (Warehouse)

```
Store
├── id: UUID
├── name: TEXT
├── location: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

The system supports **one store** (warehouse) with multiple shops. The store is the central receiving and distribution hub. **All goods flow through the store** — even local purchases must be received at the store before distribution to shops. Goods primarily flow forward, but the system supports **rare reverse flows**: shops can return unsold goods to the store, and customers can return goods to a shop. Returns generate reverse journal entries and restock the appropriate location.

#### 4.1.6 Store Inventory (Stock In)

When goods arrive at the store from a supply route, they are checked in via stock taking.

```
StoreReceiving
├── id: UUID
├── storeId: FK -> Store
├── supplyRouteId: FK -> SupplyRoute
├── supplyRouteItemId: FK -> SupplyRouteItem
├── receivedDate: TIMESTAMP
├── quantityExpected: INTEGER (from supply route item)
├── quantityReceived: INTEGER (actual count during stock taking)
├── quantityDamaged: INTEGER (default 0)
├── discrepancyNotes: TEXT (if expected != received)
├── receivedBy: FK -> User
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Loss Detection Point 1:** `quantityExpected - quantityReceived = transit loss`

**Damaged Goods:** Damaged items are tracked separately (via `quantityDamaged`). They are not added to sellable stock; instead they sit in a damaged-goods bucket and can later be either (a) sold at a discount (with admin/supervisor approval) or (b) written off as an inventory loss. Damaged inventory is a distinct asset sub-category from regular Inventory - Store / Inventory - Shop so loss reports can separate damage from theft/shrinkage.

#### 4.1.7 Store Stock (Current Inventory)

```
StoreStock
├── id: UUID
├── storeId: FK -> Store
├── productName: TEXT
├── articleNumber: TEXT (optional)
├── supplyRouteItemId: FK -> SupplyRouteItem (origin)
├── quantityOnHand: INTEGER (current stock level)
├── costPerUnitUgx: NUMERIC(15,2) (landed cost per unit)
├── minimumSellPriceUgx: NUMERIC(15,2) (minimum price store sells to shops)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.8 Shops

```
Shop
├── id: UUID
├── name: TEXT
├── location: TEXT
├── managerId: FK -> User (optional)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.9 Store-to-Shop Transfers (Stock Out)

When goods leave the store heading to a shop, they are counted out.

```
StoreTransfer
├── id: UUID
├── storeId: FK -> Store
├── shopId: FK -> Shop
├── transferDate: TIMESTAMP
├── status: ENUM ["pending", "dispatched", "received", "reconciled"]
├── dispatchedBy: FK -> User
├── receivedBy: FK -> User (nullable, set on receipt at shop)
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP

StoreTransferItem
├── id: UUID
├── storeTransferId: FK -> StoreTransfer
├── storeStockId: FK -> StoreStock
├── productName: TEXT
├── quantityDispatched: INTEGER (counted at store exit)
├── quantityReceived: INTEGER (counted at shop arrival, nullable until received)
├── unitPriceUgx: NUMERIC(15,2) (store's sell price to shop = minimumSellPrice)
├── totalPriceUgx: NUMERIC(15,2) (computed: unitPrice * quantityDispatched)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Loss Detection Point 2:** `quantityDispatched - quantityReceived = distribution loss`

**Ownership Model:** The store and all shops are owned by the same person. Transfers are **not** external sales — they are internal branch movements for accounting purposes.

**Accounting Treatment:** Transfers use **inter-branch accounting** with a transfer price (the minimum sell price). This creates:

- **Due from Shop X** (Asset on store side) — what the shop owes the store
- **Due to Store** (Liability on shop side) — what the shop owes back
- **Store Transfer Revenue** (Revenue) — the store's internal margin

These inter-branch balances net to zero in consolidated reports. There are no credit limits — shops can always receive stock regardless of outstanding balance. Settlement happens ad-hoc when the owner collects shop revenue.

#### 4.1.10 Shop Inventory

```
ShopStock
├── id: UUID
├── shopId: FK -> Shop
├── productName: TEXT
├── articleNumber: TEXT (optional)
├── storeTransferItemId: FK -> StoreTransferItem (origin)
├── quantityOnHand: INTEGER
├── costPerUnitUgx: NUMERIC(15,2) (price bought from store)
├── minimumSellPriceUgx: NUMERIC(15,2) (floor price, >= cost from store)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

#### 4.1.11 Shop Sales

```
ShopSale
├── id: UUID
├── shopId: FK -> Shop
├── saleDate: TIMESTAMP
├── soldBy: FK -> User
├── paymentMethod: ENUM ["cash", "bank", "credit"]
├── bankAccountId: FK -> BankAccount (nullable, only if payment = bank)
├── customerId: FK -> Customer (nullable, required if paymentMethod = credit)
├── totalAmount: NUMERIC(15,2)
├── paymentStatus: ENUM ["settled", "open", "partially_paid", "written_off"]
│                  -- "settled" for cash/bank sales (paid at point of sale)
│                  -- "open" for credit sales until any payment is received
│                  -- "partially_paid" when a CustomerPayment covers part of the balance
│                  -- "written_off" if balance is bad-debt written off (Admin only)
├── outstandingBalance: NUMERIC(15,2) (derived; surfaced as denormalized cache for queries — source of truth is the ledger)
├── approvedBy: FK -> User (nullable, required if any item sold below minimum OR if paymentMethod = credit)
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP

ShopSaleItem
├── id: UUID
├── shopSaleId: FK -> ShopSale
├── shopStockId: FK -> ShopStock
├── productName: TEXT
├── quantity: INTEGER
├── unitPriceUgx: NUMERIC(15,2) (actual sell price)
├── minimumPriceUgx: NUMERIC(15,2) (snapshot of minimum at time of sale)
├── isBelowMinimum: BOOLEAN (flag if sold below minimum)
├── totalPriceUgx: NUMERIC(15,2) (computed: unitPrice * quantity)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Pricing Rule:** `unitPriceUgx >= minimumSellPriceUgx` unless approved by Admin or Supervisor.

**Sales are mostly anonymous** — cash and bank sales are walk-in and require no customer record. **Credit sales are the exception**: they require a Customer record so the receivable can be tracked and later cleared. All sales are in **UGX only**.

#### 4.1.11.1 Customers (Credit Debtors)

Customer records exist solely to track who owes the business money on credit sales. Cash and bank walk-in sales do not need a customer record.

```
Customer
├── id: UUID
├── name: TEXT
├── phone: TEXT (optional)
├── notes: TEXT (optional)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Credit policy:**

- **Trust-based** — no per-customer credit limits enforced by the system.
- **Approval required:** Only Admin or Supervisor can authorize a credit sale. Sales personnel cannot grant credit on their own. The `approvedBy` field on `ShopSale` records who authorized.
- **No fixed payment terms** tracked.
- **Partial payments allowed** — a customer's outstanding balance is reduced incrementally as payments come in.

#### 4.1.11.2 Customer Payments

Records cash or bank receipts that clear (fully or partially) outstanding credit-sale balances.

```
CustomerPayment
├── id: UUID
├── customerId: FK -> Customer
├── shopId: FK -> Shop (which shop received the payment)
├── paymentDate: TIMESTAMP
├── amount: NUMERIC(15,2)
├── paymentMethod: ENUM ["cash", "bank"]
├── bankAccountId: FK -> BankAccount (nullable)
├── receivedBy: FK -> User
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

The current outstanding balance per customer is **derived from the ledger** (sum of credit-sale receivables minus sum of payments applied), not stored as a denormalized field.

**Payment-to-sale allocation:** Payments are applied to open credit sales using **FIFO by `saleDate`** (oldest sale first). The system records the allocation explicitly so customer statements can show which payments cleared which sales.

```
CustomerPaymentApplication
├── id: UUID
├── customerPaymentId: FK -> CustomerPayment
├── shopSaleId: FK -> ShopSale
├── amountApplied: NUMERIC(15,2)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

The sum of `amountApplied` across all applications for a payment equals `CustomerPayment.amount`. When a sale's outstanding balance reaches zero, its `paymentStatus` flips to `settled`. Partial coverage flips it to `partially_paid`.

**Bad-debt write-off:** If a credit sale becomes uncollectible, an Admin can mark it `written_off`. This posts: `DR Bad Debt Expense / CR Accounts Receivable` for the remaining balance. Sales personnel and supervisors cannot write off bad debt — Admin only.

#### 4.1.11.3 Returns (Customer → Shop and Shop → Store)

Returns are rare but supported. Two flows exist:

```
ShopReturn (customer returning goods to a shop)
├── id: UUID
├── shopId: FK -> Shop
├── originalSaleId: FK -> ShopSale (nullable — may be untraceable for old sales)
├── returnDate: TIMESTAMP
├── reason: TEXT
├── refundMethod: ENUM ["cash", "bank", "credit_adjustment"]
│                  -- "credit_adjustment" reduces customer balance for credit sales
├── bankAccountId: FK -> BankAccount (nullable)
├── customerId: FK -> Customer (nullable, required for credit_adjustment)
├── totalRefund: NUMERIC(15,2)
├── approvedBy: FK -> User (Admin or Supervisor)
├── receivedBy: FK -> User
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP

ShopReturnItem
├── id: UUID
├── shopReturnId: FK -> ShopReturn
├── shopStockId: FK -> ShopStock (which stock line the item is being returned to)
├── productName: TEXT
├── quantity: INTEGER
├── unitRefundPriceUgx: NUMERIC(15,2)
├── condition: ENUM ["resellable", "damaged"]
│              -- if damaged, goods go to damaged bucket, not regular stock
├── totalRefundUgx: NUMERIC(15,2)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

```
StoreReturn (shop returning unsold goods to the store)
├── id: UUID
├── shopId: FK -> Shop (originating shop)
├── storeId: FK -> Store (destination)
├── originalTransferId: FK -> StoreTransfer (nullable)
├── returnDate: TIMESTAMP
├── reason: TEXT
├── status: ENUM ["dispatched", "received", "reconciled"]
├── dispatchedBy: FK -> User (at shop)
├── receivedBy: FK -> User (at store)
├── approvedBy: FK -> User (Admin or Supervisor)
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP

StoreReturnItem
├── id: UUID
├── storeReturnId: FK -> StoreReturn
├── shopStockId: FK -> ShopStock
├── productName: TEXT
├── quantityDispatched: INTEGER
├── quantityReceived: INTEGER (nullable until received at store)
├── unitTransferPriceUgx: NUMERIC(15,2) (original transfer price reversed)
├── condition: ENUM ["resellable", "damaged"]
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Approval:** All returns (both flows) require Admin or Supervisor approval. Sales personnel cannot accept returns on their own.

**Damaged returns:** If a returned item is damaged, it lands in the location's damaged-goods bucket rather than being added back to sellable stock.

#### 4.1.12 Location Expenses (Store & Shop Operating Costs)

Both the store and shops have their own operating expenses independent of supply routes.

```
LocationExpense
├── id: UUID
├── locationType: ENUM ["store", "shop"]
├── locationId: UUID (store or shop ID)
├── category: TEXT (freeform, e.g., "rent", "wages", "utilities", "transport")
├── description: TEXT
├── amount: NUMERIC(15,2) (in UGX)
├── expenseDate: DATE
├── paymentMethod: ENUM ["cash", "bank"]
├── bankAccountId: FK -> BankAccount (nullable)
├── recordedBy: FK -> User
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

These are posted to the ledger as: `DR: [Expense Category] / CR: Cash or Bank`

#### 4.1.13 Stock Taking (Physical Inventory Counts)

```
StockTake
├── id: UUID
├── locationType: ENUM ["store", "shop"]
├── locationId: UUID (store or shop ID)
├── stockTakeDate: TIMESTAMP
├── status: ENUM ["in_progress", "completed", "reconciled"]
├── conductedBy: FK -> User
├── notes: TEXT
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP

StockTakeItem
├── id: UUID
├── stockTakeId: FK -> StockTake
├── storeStockId: FK -> StoreStock (nullable, set when locationType = store)
├── shopStockId: FK -> ShopStock (nullable, set when locationType = shop)
├── productName: TEXT
├── systemQuantity: INTEGER (what the system says we should have)
├── physicalQuantity: INTEGER (what was actually counted)
├── discrepancy: INTEGER (computed: physicalQuantity - systemQuantity)
├── notes: TEXT (explanation for discrepancy)
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Loss Detection Point 3:** `systemQuantity - physicalQuantity = shrinkage/loss at location`

**Reconciliation:** After a stock take, the system must provide a mechanism to adjust system quantities to match physical counts, with full audit trail and corresponding ledger entries.

---

### 4.2 Accounting Entities

Modeled after the money-lending project's double-entry ledger system.

#### 4.2.1 Transaction Categories (Chart of Accounts)

```
TransactionCategory
├── id: UUID
├── name: TEXT
├── type: ENUM ["asset", "liability", "equity", "revenue", "expense"]
├── isDefault: BOOLEAN
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Seeded Categories:**

| Name                      | Type           | Purpose                                          |
| ------------------------- | -------------- | ------------------------------------------------ |
| Cash                      | Asset          | Physical cash on hand                            |
| Bank                      | Asset          | Money in bank accounts                           |
| Inventory - Store         | Asset          | Value of goods in warehouse                      |
| Inventory - Shop          | Asset          | Value of goods at shops                          |
| Damaged Inventory - Store | Asset          | Value of damaged goods at warehouse (segregated) |
| Damaged Inventory - Shop  | Asset          | Value of damaged goods at shops (segregated)     |
| Accounts Receivable       | Asset          | Outstanding balances owed by credit customers    |
| Due from Shop             | Asset          | What shops owe the store (inter-branch)          |
| Supplier Payable          | Liability      | What is owed to suppliers                        |
| Due to Store              | Liability      | What shops owe the store (inter-branch)          |
| Owner's Equity            | Equity         | Owner's capital                                  |
| Sales Revenue             | Revenue        | Income from shop sales                           |
| Sales Returns             | Contra-Revenue | Customer refunds (reduces revenue)               |
| Store Transfer Revenue    | Revenue        | Store's margin on transfers to shops             |
| Cost of Goods Sold        | Expense        | Cost of goods that were sold                     |
| Freight Expense           | Expense        | Shipping/freight costs                           |
| Transportation Expense    | Expense        | Local transport costs                            |
| Customs Expense           | Expense        | Customs/duties                                   |
| Travel Expense            | Expense        | Tickets and travel                               |
| Rent Expense              | Expense        | Rent payments                                    |
| Salary Expense            | Expense        | Staff salaries                                   |
| Tax Expense               | Expense        | Tax payments                                     |
| Inventory Loss            | Expense        | Losses detected via stock take                   |
| Damaged Goods Write-off   | Expense        | Damaged inventory written off (no resale)        |
| Bad Debt Expense          | Expense        | Uncollectible credit-sale balances written off   |
| Miscellaneous Expense     | Expense        | Other expenses                                   |

#### 4.2.2 Transactions (Ledger Entries)

```
Transaction
├── id: UUID
├── type: ENUM ["debit", "credit"]
├── amount: NUMERIC(15,2)
├── categoryId: FK -> TransactionCategory
├── referenceType: TEXT (e.g., "supply_route", "store_transfer", "shop_sale",
│                        "stock_take_adjustment", "fund_transfer", "expense",
│                        "customer_payment", "shop_return", "store_return",
│                        "bad_debt_writeoff", "reversal")
├── referenceId: TEXT (ID of the referenced entity)
├── journalGroupId: UUID (groups related debits/credits)
├── reversesJournalGroupId: UUID (nullable; if set, this group reverses an earlier group)
├── reversedByJournalGroupId: UUID (nullable; if set, this group has been reversed)
├── transactionDate: TIMESTAMP WITH TIMEZONE
├── description: TEXT
├── locationType: ENUM ["store", "shop"] (which location this transaction belongs to)
├── locationId: UUID (store or shop ID, for per-location reporting)
├── depositLocation: ENUM ["cash", "bank"] (for money movements)
├── bankAccountId: FK -> BankAccount (nullable, for bank transactions)
├── recordedBy: FK -> User
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

**Fundamental Rule:** Every journal entry groups all related debits and credits under the same `journalGroupId`. Total debits must equal total credits within a group. Compound entries (more than 2 lines) are allowed for complex transactions like inter-branch transfers.

#### 4.2.3 Bank Accounts

```
BankAccount
├── id: UUID
├── bankName: TEXT
├── accountNumber: TEXT
├── accountName: TEXT
├── notes: TEXT
├── isActive: BOOLEAN
├── createdAt: TIMESTAMP
└── updatedAt: TIMESTAMP
```

---

## 5. Key Business Rules & Journal Entries

### 5.1 Procurement (Supply)

**When goods are purchased from a supplier:**

| Debit             | Credit      | Amount            |
| ----------------- | ----------- | ----------------- |
| Inventory - Store | Cash / Bank | Total cost in UGX |

If international, additional expense entries:

| Debit           | Credit      | Amount         |
| --------------- | ----------- | -------------- |
| Freight Expense | Cash / Bank | Freight amount |
| Travel Expense  | Cash / Bank | Ticket cost    |
| Customs Expense | Cash / Bank | Customs fees   |

If local supplier:

| Debit                  | Credit      | Amount         |
| ---------------------- | ----------- | -------------- |
| Transportation Expense | Cash / Bank | Transport cost |

### 5.2 Store to Shop Transfer (Inter-Branch)

**When goods leave the store to a shop (compound journal entry):**

Example: trousers with landed cost 10,000 UGX transferred at minimum sell price 15,000 UGX.

|                                  | Debit  | Credit | Amount                               |
| -------------------------------- | ------ | ------ | ------------------------------------ |
| Inventory - Shop (Asset)         | 15,000 |        | Transfer price                       |
| Inventory - Store (Asset)        |        | 10,000 | Landed cost                          |
| Store Transfer Revenue (Revenue) |        | 5,000  | Store margin (transfer price - cost) |
| Due from Shop (Asset)            | 15,000 |        | Store is owed by shop                |
| Due to Store (Liability)         |        | 15,000 | Shop owes the store                  |

**Accounting equation check:**

- Assets: +15,000 (shop inventory) - 10,000 (store inventory) + 15,000 (due from shop) = +20,000
- Liabilities: +15,000 (due to store) = +15,000
- Equity: +5,000 (revenue) = +5,000
- A (+20,000) = L (+15,000) + E (+5,000) — balanced

**Note:** Due from Shop and Due to Store net to zero in consolidated reports. Store Transfer Revenue is eliminated in consolidation since you cannot profit from yourself. The real profit is only realized when the shop sells to a customer.

### 5.3 Shop Sale (Retail)

**When a shop sells goods to a customer for cash or bank:**

| Debit              | Credit           | Amount             |
| ------------------ | ---------------- | ------------------ |
| Cash / Bank        | Sales Revenue    | Sale amount        |
| Cost of Goods Sold | Inventory - Shop | Cost of goods sold |

**When a shop sells goods to a customer on credit (Admin/Supervisor approved):**

| Debit               | Credit           | Amount             |
| ------------------- | ---------------- | ------------------ |
| Accounts Receivable | Sales Revenue    | Sale amount        |
| Cost of Goods Sold  | Inventory - Shop | Cost of goods sold |

**When a credit customer later pays (full or partial):**

| Debit       | Credit              | Amount         |
| ----------- | ------------------- | -------------- |
| Cash / Bank | Accounts Receivable | Payment amount |

### 5.4 Shop Settlement to Store

**When the owner collects revenue from a shop and settles the inter-branch balance:**

|                          | Debit | Credit | Amount                    |
| ------------------------ | ----- | ------ | ------------------------- |
| Cash / Bank (Store)      | X     |        | Payment amount            |
| Due from Shop (Asset)    |       | X      | Reduces what shop owes    |
| Due to Store (Liability) | X     |        | Reduces shop's obligation |
| Cash / Bank (Shop)       |       | X      | Cash leaves shop          |

Settlement is ad-hoc — no fixed schedule or credit limits since all locations are owned by the same person.

### 5.5 Stock Take Adjustment

**When physical count differs from system (loss detected):**

| Debit          | Credit                               | Amount              |
| -------------- | ------------------------------------ | ------------------- |
| Inventory Loss | Inventory - Store / Inventory - Shop | Value of lost goods |

### 5.5.1 Damaged Goods

**When goods are flagged as damaged on receipt or during stock take (move to damaged bucket):**

| Debit                            | Credit                   | Amount                      |
| -------------------------------- | ------------------------ | --------------------------- |
| Damaged Inventory - Store / Shop | Inventory - Store / Shop | Cost value of damaged goods |

**When damaged goods are sold at a discount (Admin/Supervisor approved):**

| Debit                             | Credit                           | Amount                |
| --------------------------------- | -------------------------------- | --------------------- |
| Cash / Bank / Accounts Receivable | Sales Revenue                    | Discounted sale price |
| Cost of Goods Sold                | Damaged Inventory - Store / Shop | Cost value            |

**When damaged goods are written off (cannot be sold):**

| Debit                   | Credit                           | Amount     |
| ----------------------- | -------------------------------- | ---------- |
| Damaged Goods Write-off | Damaged Inventory - Store / Shop | Cost value |

### 5.5.2 Customer Return to Shop

**Cash or bank refund (item resellable, returned to stock):**

| Debit            | Credit             | Amount        |
| ---------------- | ------------------ | ------------- |
| Sales Returns    | Cash / Bank        | Refund amount |
| Inventory - Shop | Cost of Goods Sold | Cost value    |

**Refund applied as credit-balance adjustment (customer originally bought on credit):**

| Debit            | Credit              | Amount        |
| ---------------- | ------------------- | ------------- |
| Sales Returns    | Accounts Receivable | Refund amount |
| Inventory - Shop | Cost of Goods Sold  | Cost value    |

**If the returned item is damaged, the inventory leg targets Damaged Inventory - Shop instead of Inventory - Shop.**

### 5.5.3 Shop Return to Store

**When a shop sends unsold goods back to the store (reverses the original transfer):**

|                          | Debit              | Credit             | Amount                        |
| ------------------------ | ------------------ | ------------------ | ----------------------------- |
| Inventory - Store        | X                  |                    | Cost value at store           |
| Inventory - Shop         |                    | X (transfer price) | Reverses shop inventory       |
| Store Transfer Revenue   | Y                  |                    | Reverses store's prior margin |
| Due to Store (Liability) | X (transfer price) |                    | Reduces shop's obligation     |
| Due from Shop (Asset)    |                    | X (transfer price) | Reduces store's receivable    |

Where `X` = original transfer price and `Y` = original margin (transfer price minus landed cost). If the returned goods are damaged, the store-side debit lands in Damaged Inventory - Store.

### 5.6 Operating Expenses

**Rent, salary, tax, miscellaneous:**

| Debit              | Credit      | Amount         |
| ------------------ | ----------- | -------------- |
| [Specific Expense] | Cash / Bank | Expense amount |

### 5.7 Fund Transfers

**Moving money between cash and bank:**

| Debit              | Credit        | Amount          |
| ------------------ | ------------- | --------------- |
| Cash (destination) | Cash (source) | Transfer amount |

### 5.8 Bad Debt Write-off (Credit Sales)

**When an Admin determines a credit-sale balance is uncollectible:**

| Debit            | Credit              | Amount                        |
| ---------------- | ------------------- | ----------------------------- |
| Bad Debt Expense | Accounts Receivable | Remaining outstanding balance |

The originating `ShopSale.paymentStatus` flips to `written_off` and its `outstandingBalance` becomes zero.

### 5.9 Journal Entry Reversals

**Journal entries are immutable.** Once a journal group is posted, it cannot be edited or deleted. Corrections happen exclusively via reversal:

1. A new journal group is created with each leg's debit/credit type flipped.
2. The new group's `reversesJournalGroupId` is set to the original group's ID.
3. The original group's `reversedByJournalGroupId` is set to the new group's ID.
4. Both groups remain in the ledger; balances naturally net to zero for the reversed entries.
5. Reversals require Admin or Supervisor authorization and a mandatory `description` explaining the reason.

**Reports honor reversals:** when computing balances or trial balance, the system includes both the original and the reversal — there is no flag to "hide" reversed entries; the math takes care of itself.

---

## 6. Currency Handling

The system must support multi-currency procurement with conversion to UGX:

### 6.1 Conversion Chain (International)

```
Foreign Currency (RMB/BHT)  -->  USD  -->  UGX

Cost per unit (UGX) = unitPriceForeign / exchangeRateForeignToUsd * exchangeRateUsdToUgx
Total cost (UGX)    = costPerUnit * quantity
```

### 6.2 Conversion Formula (from Excel)

```
Total Cost (shs) = RATE(rmb) / EX.RATE(rmb/dollar) * USD_RATE(shs/dollar) * QTY
```

### 6.3 Exchange Rates

- Exchange rates are recorded **per supply route item** (they may vary within a trip)
- Historical exchange rates are preserved for audit purposes
- The system stores amounts in both the original currency and UGX

### 6.4 Local Purchases

For local suppliers, purchases are directly in UGX. No currency conversion is needed, but the system must still support recording the purchase price and computing margins.

---

## 7. Pricing Model

### 7.1 Price Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  LANDED COST     │     │  STORE SELL      │     │  SHOP SELL       │
│  (per unit UGX) │────>│  PRICE           │────>│  PRICE           │
│                 │     │  = min sell price │     │  >= min sell price│
│  costPerUnit    │     │  set by admin    │     │  flexible markup  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 7.2 Minimum Price Rules

1. **Store to Shop:** The store transfers to shops at the **minimum sell price** set by the admin on StoreStock
2. **Shop to Customer:** Shops must sell at or above the **minimum sell price** (automatically copied from StoreStock at transfer time)
3. **Below-minimum exception:** Only Admin or Supervisor can authorize a sale below the minimum price
4. **No standard retail price:** Shops have flexible pricing as long as it meets or exceeds the minimum

### 7.3 Profit Tracking

- **Supply Profit:** sellingPrice - landedCost (per item, per route)
- **Store Margin:** storeSellPrice - landedCost
- **Shop Margin:** shopSellPrice - storeSellPrice
- **Overall Profit:** Total revenue - Total costs (all expenses included)

---

## 8. Roles & Permissions

### 8.1 Role Definitions

| Role                | Description                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**           | Full system access. Can configure prices, manage users, approve exceptions, view all reports                                            |
| **Supervisor**      | Operational oversight. Can manage stock, approve below-minimum sales, view reports                                                      |
| **Sales Personnel** | Data entry only. Assigned to a **specific shop**. Can record sales, view own shop inventory. Cannot modify prices or approve exceptions |

### 8.2 Permission Matrix

| Action                         | Admin         | Supervisor    | Sales         |
| ------------------------------ | ------------- | ------------- | ------------- |
| Manage suppliers               | Yes           | No            | No            |
| Create supply routes           | Yes           | Yes           | No            |
| Record supply route items      | Yes           | Yes           | No            |
| Record supply expenses         | Yes           | Yes           | No            |
| Receive goods at store         | Yes           | Yes           | No            |
| Set minimum sell price         | Yes           | No            | No            |
| Transfer goods to shop         | Yes           | Yes           | No            |
| Record shop sales (cash/bank)  | Yes           | Yes           | Yes           |
| Authorize credit sale          | Yes           | Yes           | No            |
| Manage customers (debtors)     | Yes           | Yes           | No            |
| Record customer payment        | Yes           | Yes           | Yes           |
| Sell below minimum price       | Yes (approve) | Yes (approve) | No            |
| Sell damaged goods at discount | Yes (approve) | Yes (approve) | No            |
| Write off damaged goods        | Yes           | Yes           | No            |
| Approve customer return        | Yes           | Yes           | No            |
| Approve shop-to-store return   | Yes           | Yes           | No            |
| Conduct stock taking           | Yes           | Yes           | No            |
| Reconcile stock                | Yes           | Yes           | No            |
| View store reports             | Yes           | Yes           | No            |
| View shop reports              | Yes           | Yes           | Own shop only |
| View financial reports         | Yes           | Yes           | No            |
| Manage users                   | Yes           | No            | No            |
| Manage bank accounts           | Yes           | No            | No            |
| Record expenses                | Yes           | Yes           | No            |
| Transfer funds                 | Yes           | Yes           | No            |

---

## 9. Loss Detection System

The system must detect and report losses at four critical points:

### 9.1 Transit Loss

**Point:** Between supplier and store
**Detection:** `quantityOrdered (from supply route item) - quantityReceived (at store)`
**Trigger:** Stock receiving process
**Report:** Per supply route, per item

### 9.2 Distribution Loss

**Point:** Between store and shop
**Detection:** `quantityDispatched (from store) - quantityReceived (at shop)`
**Trigger:** Shop receiving confirmation
**Report:** Per transfer, per item

### 9.3 Store Shrinkage

**Point:** Within the store
**Detection:** `systemQuantity - physicalCount` during stock taking
**Trigger:** Stock take reconciliation
**Report:** Per stock take event

### 9.4 Shop Shrinkage

**Point:** Within each shop
**Detection:** `systemQuantity - physicalCount` during stock taking
**Trigger:** Stock take reconciliation at shop
**Report:** Per shop, per stock take event

### 9.5 Loss Accounting

All detected losses must be:

1. Recorded as inventory adjustments
2. Posted to the ledger as `DR: Inventory Loss / CR: Inventory`
3. Included in financial reports as expenses
4. Tracked over time for trend analysis

---

## 10. Reporting Requirements

### 10.1 Supply Reports

- **Gross Profit per Route:** Mirrors the existing Excel structure - items, costs, selling prices, profit per route
- **Supplier Summary:** Total purchases, routes, and costs per supplier
- **Currency Conversion Report:** Exchange rates used, amounts in each currency
- **Expense Breakdown:** Per route, categorized expenses

### 10.2 Store Reports

- **Current Stock Levels:** All products in warehouse with quantities and values
- **Stock Movement:** Goods received vs. goods dispatched over a period
- **Transfer History:** All transfers to shops with status
- **Loss Report:** Transit and shrinkage losses

### 10.3 Shop Reports

- **Sales Report:** Daily/weekly/monthly sales per shop
- **Inventory Report:** Current stock per shop
- **Profit Report:** Revenue minus cost for each shop
- **Below-Minimum Sales:** All sales made below minimum price with approver
- **Loss Report:** Shrinkage losses per shop

### 10.4 Financial Reports (Ledger-Derived)

All financial reports must be derived directly from the ledger, not from denormalized fields:

- **Profit & Loss Statement:** Revenue minus expenses for a period (net of Sales Returns)
- **Balance Sheet:** Assets, liabilities, equity at a point in time
- **Cash Position:** Cash on hand and bank balances (by bank account)
- **Inter-Branch Balances:** What each shop owes the store (Due from Shop / Due to Store)
- **Accounts Receivable / Customer Statements:** Outstanding balance per credit customer, sale and payment history
- **Damaged Goods Report:** Damaged inventory by location, with disposition status (held, sold-discounted, written-off)
- **Returns Report:** Customer returns and shop-to-store returns over a period
- **Trial Balance:** Verification that debits equal credits
- **General Ledger:** Full transaction history with journal entries

---

## 11. Stock Taking & Reconciliation

### 11.1 Stock Taking Process

1. **Initiate:** Admin/Supervisor creates a stock take event for a store or shop
2. **Count:** Physical count of all items at the location
3. **Compare:** System shows side-by-side: system quantity vs. physical quantity
4. **Record Discrepancies:** Note differences with explanations
5. **Reconcile:** Adjust system quantities to match physical counts
6. **Post to Ledger:** Adjustments create ledger entries for losses/gains
7. **Close:** Mark stock take as reconciled

### 11.2 Reconciliation Rules

- Adjustments require Admin or Supervisor approval
- Every adjustment creates an audit trail
- Losses are posted as expenses to the ledger
- Gains (if any) are investigated before posting

---

## 12. Account Structure

**Ownership:** The store and all shops are owned by the same person. The accounting separation exists to track performance and detect losses at each location, not to model separate legal entities.

### 12.1 Store Account

The store maintains its own account tracking:

- **Revenue:** Store Transfer Revenue (margin on transfers to shops)
- **Expenses:** Procurement costs, route expenses (freight, tickets, etc.), plus operating expenses (rent, staff salaries, utilities, etc. — freeform entry)
- **Due from Shops:** Inter-branch balances owed by each shop
- **Inventory Value:** Current stock value

### 12.2 Shop Accounts

Each shop maintains:

- **Revenue:** Income from retail sales to customers
- **Expenses:** Cost of goods (transfer price from store), plus operating expenses (rent, staff wages, utilities, transport, etc. — freeform entry)
- **Due to Store:** Inter-branch balance owed to the store
- **Cash/Bank:** Money collected from sales

### 12.3 Cash & Bank Accounts

- **Cash Account:** Physical cash on hand (per location)
- **Bank Accounts:** Multiple bank accounts can be registered
- Every deposit and withdrawal is recorded with the specific bank
- Fund transfers between cash and bank are tracked

---

## 13. Data Model Relationships

```
Supplier (*) ──── (*) SupplyRoute (via SupplyRouteSupplier)
Supplier (1) ──── (*) SupplyRouteItem
SupplyRoute (1) ──── (*) SupplyRouteItem
SupplyRoute (1) ──── (*) SupplyRouteExpense
SupplyRouteItem (1) ──── (*) StoreReceiving
Store (1) ──── (*) StoreStock
Store (1) ──── (*) StoreTransfer
Shop (*) ──── (*) StoreTransfer
StoreTransfer (1) ──── (*) StoreTransferItem
Shop (1) ──── (*) ShopStock
Shop (1) ──── (*) ShopSale
ShopSale (1) ──── (*) ShopSaleItem
Store/Shop (1) ──── (*) StockTake
StockTake (1) ──── (*) StockTakeItem
BankAccount (1) ──── (*) Transaction (via bankAccountId)
TransactionCategory (1) ──── (*) Transaction
User (1) ──── (*) [various recordedBy/conductedBy fields]
```

---

## 14. Non-Functional Requirements

### 14.1 Security

- All routes protected by authentication
- Role-based access control enforced at API level
- Sensitive operations (price changes, stock adjustments, credit-sale authorization, write-offs, reversals) require elevated roles
- Audit trail for all data modifications

### 14.2 Data Integrity

- All monetary calculations use precise decimal arithmetic (NUMERIC(15,2))
- Double-entry ledger enforced: every journal entry must balance
- Foreign key constraints on all relationships
- Soft deletes with audit trail for **reference entities only** (Customer, Supplier, Shop, BankAccount, User, TransactionCategory) via a nullable `deletedAt` column. Transactional records (sales, transfers, transactions, stock takes) are **never** soft-deleted — corrections happen via reversal entries (§5.9).

### 14.3 Performance

- Ledger queries must support date-range filtering for efficient reporting
- Indexes on frequently queried columns (journalGroupId, referenceType, transactionDate, customerId, locationId+transactionDate)
- Financial snapshot caching for expensive report computations

### 14.4 Auditability

- Every transaction linked to its source via referenceType/referenceId
- Journal groups link debit/credit pairs
- Reversals link to the group they reverse (and vice versa)
- Stock take history preserved indefinitely
- User attribution on all create/update/approve actions

#### 14.4.1 Audit Log

A generic, append-only `AuditLog` table records sensitive operations beyond what the ledger captures (price changes, approvals, role grants, customer record edits, etc.).

```
AuditLog
├── id: UUID
├── actorUserId: FK -> User
├── action: TEXT (e.g., "minimum_price.update", "user.role_change",
│                       "credit_sale.authorize", "bad_debt.writeoff",
│                       "journal.reverse", "stock.reconcile")
├── entityType: TEXT (e.g., "store_stock", "shop_sale", "user")
├── entityId: TEXT
├── before: JSONB (nullable — prior state)
├── after: JSONB (nullable — new state)
├── metadata: JSONB (nullable — extra context, e.g., approval reason)
├── ipAddress: INET (nullable)
├── userAgent: TEXT (nullable)
├── createdAt: TIMESTAMP WITH TIMEZONE
```

`AuditLog` is **append-only**: no updates or deletes. Admin-only read access.

### 14.5 Time Zone & Business Day

- All timestamps stored as `TIMESTAMP WITH TIMEZONE` (UTC internally)
- Reports and "by day" aggregations use **Africa/Kampala** (UTC+3) as the business time zone
- Daily reports use the local-time day boundary (00:00–23:59 Africa/Kampala)
- A single constant `BUSINESS_TIMEZONE = "Africa/Kampala"` is referenced wherever date boundaries matter

### 14.6 Concurrency

Stock contention can occur when two users (e.g., two sales personnel at the same shop) attempt to sell the last unit simultaneously. The system protects against this with:

- **Row-level locking** during sales: `SELECT ... FOR UPDATE` on the relevant `ShopStock` row inside the sale transaction. The second concurrent sale waits, then re-reads quantity and fails cleanly with a "stock just sold out" error.
- **Same approach applies to** stock-take reconciliation, transfers, and returns — any operation that mutates a stock row.
- **Idempotency keys** on all mutating server functions: clients pass an `Idempotency-Key` header; the server deduplicates retries within a 24-hour window.

### 14.7 Backup, Retention, and Disaster Recovery

- **Database backups:** Neon's built-in branching/PITR (Point-in-Time Recovery) is the primary mechanism. Retention: 7 days on free tier (upgrade if longer retention is needed for compliance).
- **RPO target:** ≤ 5 minutes (Neon WAL-based PITR meets this).
- **RTO target:** ≤ 1 hour for app + sync layer (re-deploy from CI; ElectricSQL is stateless beyond the WAL replication slot).
- **Logical replication slot:** monitor lag — a stalled ElectricSQL consumer can cause WAL bloat on Neon. Alert if slot lag > 1 GB.
- **Off-site export:** weekly `pg_dump` of all non-ledger reference tables to Cloudflare R2 as a belt-and-braces measure. Ledger is the system of record and is included.
- **Retention:** ledger entries and audit logs are retained indefinitely. Soft-deleted reference rows are retained indefinitely (compliance + audit).

### 14.8 Human-Readable Document Numbers

Every document a user might reference verbally or in print has a stable, sequential, human-readable number alongside its internal UUID. Numbers are zero-padded and prefixed by document type and year.

| Document            | Format              | Example             |
| ------------------- | ------------------- | ------------------- |
| Supply route        | `SR-YYYY-NNNN`      | `SR-2026-0048`      |
| Store receiving     | `RCV-YYYY-NNNN`     | `RCV-2026-0123`     |
| Store transfer      | `TRF-YYYY-NNNN`     | `TRF-2026-0089`     |
| Shop sale (receipt) | `SALE-YYYY-NNNNN`   | `SALE-2026-00457`   |
| Customer payment    | `PAY-YYYY-NNNN`     | `PAY-2026-0021`     |
| Shop return         | `RET-YYYY-NNNN`     | `RET-2026-0007`     |
| Store return        | `STR-RET-YYYY-NNNN` | `STR-RET-2026-0003` |
| Stock take          | `STK-YYYY-NNNN`     | `STK-2026-0014`     |

Numbers are generated server-side using a per-prefix Postgres sequence and reset annually. They are immutable once issued.

### 14.9 Receipt & Document Generation

The system generates printable PDFs for the following documents:

- **Sales receipt** (per `ShopSale`) — issued at point of sale, includes shop name, items, total, payment method, and document number
- **Transfer slip** (per `StoreTransfer`) — accompanies goods leaving the warehouse, lists items dispatched
- **Customer statement** (per `Customer`, on demand) — outstanding balance, sale history, payment history, aged receivables
- **Stock-take worksheet** (per `StockTake`) — printable count sheet with system quantities hidden until reconciliation

PDFs are generated on demand via server function (no batch storage); receipts can be printed or downloaded.

### 14.10 Listing, Search & Pagination

All list endpoints (sales, transfers, customers, ledger) follow a consistent contract:

- **Pagination:** cursor-based (`?cursor=<id>&limit=<n>`), default limit 50, max 200
- **Filters:** date range, location, status, free-text search where applicable (e.g., customer name, product name, document number)
- **Sort:** explicit `?sort=<field>:<asc|desc>`; default by `createdAt desc`
- **Total count** is **not** returned by default (avoid `SELECT COUNT(*)` on hot paths). A separate `?countHint=true` parameter triggers an approximate count via `pg_stat_*` for large lists.

### 14.11 Notifications & Alerts

The system emits in-app notifications (and optionally email for Admin) for events that need attention:

| Trigger                                         | Audience          | Channel        |
| ----------------------------------------------- | ----------------- | -------------- |
| Shop stock for an item drops below 5 units      | Admin, Supervisor | In-app         |
| Stock take discrepancy > 10% of system quantity | Admin, Supervisor | In-app + email |
| Credit sale outstanding > 30 days               | Admin, Supervisor | In-app + email |
| Below-minimum sale recorded                     | Admin, Supervisor | In-app         |
| Bad-debt write-off                              | Admin             | In-app + email |
| Journal reversal posted                         | Admin             | In-app + email |
| Logical replication slot lag > 1 GB             | Admin (sysops)    | Email          |

Thresholds (low-stock count, aging window, discrepancy %) are configurable in settings, not hardcoded.

### 14.12 Excel Data Import

A one-time import path migrates the historical `gross_profit.xlsx` (47 routes, 2011–2026) into the system:

- **CSV upload UI** for Admin only: one tab per supply route
- **Preview step:** parsed rows are shown side-by-side with their target schema fields; user resolves ambiguous columns before commit
- **Idempotent import:** each route gets a deterministic `external_ref` (e.g., sheet name) so re-running the import skips already-imported routes
- **Historical exchange rates:** imported as-is from the spreadsheet, preserved on `SupplyRouteItem` records
- **No ledger backfill:** historical routes are imported as **closed** routes with no journal entries (the business considers them already settled). Opening balances for cash/bank/inventory are entered separately as a single `Owner's Equity` opening journal.
- **Audit trail:** every imported row writes an `AuditLog` entry with `action = "import.excel"` and the source filename + sheet.

---

## 15. Implementation Phases (Suggested)

### Phase 1: Foundation

- Database schema (all tables, migrations)
- Double-entry ledger engine (postJournalEntry, ledger queries)
- Authentication and role-based access
- Supplier management CRUD

### Phase 2: Supply Module

- Supply route creation and management
- Item-level purchase recording with currency conversion
- Expense recording per route
- Gross profit calculation per route

### Phase 3: Store Module

- Store receiving (stock in from supply routes)
- Store inventory management
- Store-to-shop transfers with stock counting
- Stock taking at store level
- Reconciliation workflow

### Phase 4: Shop Module

- Shop inventory management
- Sales recording with flexible pricing
- Minimum price enforcement with approval workflow
- Shop-level stock taking
- Shop-to-store settlement (ad-hoc inter-branch balance clearing)

### Phase 5: Accounting & Reports

- Full ledger UI (general ledger view)
- Financial reports (P&L, balance sheet, trial balance)
- Cash and bank account management
- Fund transfers
- Supply route profit reports (replacing the Excel)

### Phase 6: Loss Detection & Analytics

- Loss detection dashboards
- Trend analysis across stock takes
- Route-by-route profitability comparison
- Shop performance comparison

---

## 16. Appendix

### 16.1 Excel Column Mapping

The following maps the existing Excel structure to system fields:

| Excel Column  | System Field                                                         |
| ------------- | -------------------------------------------------------------------- |
| DATE          | supplyRouteItem.createdAt / supplyRoute.departureDate                |
| DETAILS       | supplyRouteItem.productName                                          |
| ART NO        | supplyRouteItem.articleNumber                                        |
| EX.RATE       | supplyRouteItem.exchangeRateForeignToUsd                             |
| QTY           | supplyRouteItem.quantity                                             |
| RATE(rmb)     | supplyRouteItem.unitPriceForeign                                     |
| AMOUNT(rmb)   | supplyRouteItem.totalAmountForeign                                   |
| USD($)        | supplyRouteItem.totalAmountUsd                                       |
| USD RATE(Shs) | supplyRouteItem.exchangeRateUsdToUgx                                 |
| T.COST(shs)   | supplyRouteItem.totalCostUgx                                         |
| RATE(shs)     | N/A (actual sell price determined at shop level, not at procurement) |
| SELLING PX    | N/A (derived from ShopSaleItem records)                              |
| G.PROFIT      | N/A (derived from ledger: sales revenue minus costs)                 |

### 16.2 Expense Category Mapping

| Excel Expense | System Category                              |
| ------------- | -------------------------------------------- |
| COST          | (sum of item costs - not a separate expense) |
| FREIGHT       | freight                                      |
| TICKET        | ticket (maps to Travel Expense)              |
| EXPENSES      | miscellaneous                                |
| RENT          | rent                                         |
| SALLARY       | salary                                       |
| TAX           | tax                                          |

### 16.3 Future Work (Out of Scope)

- **User entity & auth system:** Full user management, authentication, role assignment, and shop assignment. To be defined in a separate technical document.

### 16.4 Reference Project

The double-entry accounting system is modeled after the money-lending project at `/Users/faridmatovu/projects/money-lending`, specifically:

- **Ledger architecture:** `src/services/transaction.service.ts` - `postJournalEntry()` function
- **Balance queries:** `src/services/ledger-queries.service.ts` - deriving balances from ledger
- **Auto-posting:** `src/services/auto-post.service.ts` - automated journal entries
- **Reports:** `src/services/report.service.ts` - P&L, balance sheet from ledger
- **Schema patterns:** `src/lib/db/schema/transactions.ts` - transaction table structure
