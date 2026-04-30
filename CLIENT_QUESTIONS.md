# Client Questions

Outstanding questions that need client input before finalizing requirements.

---

### 1. Damaged Goods Handling — RESOLVED (2026-04-29)

When goods arrive at the store damaged, or get damaged at a shop, how should the system handle them?

- (a) Write them off immediately — mark as a loss, post to ledger as expense
- **(b) Track separately — mark as damaged, option to sell at a discount later or write off** ← CHOSEN
- (c) Don't track damage explicitly — just let stock taking catch discrepancies

**Decision:** Option (b). Damaged goods are tracked separately with the option to sell at a discount or write off later.

---

### 2. Returns / Reverse Flow of Goods — RESOLVED (2026-04-29)

Can goods flow backwards in the system?

- (a) A shop can return unsold goods back to the store
- (b) A customer can return goods to a shop after purchase
- **(c) Both** ← CHOSEN (rarely, but must be supported)
- (d) Neither — goods only flow forward

**Decision:** Option (c). Returns happen rarely but the system must support both shop→store and customer→shop returns. Reverse journal entries, restocking workflows, and refund tracking are required.

---

### 3. Customer Credit Sales — RESOLVED (2026-04-29)

Customers can take goods on credit (deferred payment).

**Decisions:**
- **Credit limits:** None — trust-based. No per-customer limits enforced by the system.
- **Payment terms:** Not tracked.
- **Approval:** Only Admin or Supervisor can grant credit. Sales personnel cannot.
- **Partial payments:** Assumed allowed (standard A/R behavior).

**Design implications:**
- Customer/debtor entity with outstanding balance tracking (only created when needed for credit)
- Sales transaction supports "credit" as a payment method alongside cash/bank
- Ledger on credit sale: DR Accounts Receivable / CR Sales Revenue (+ DR COGS / CR Inventory)
- Payment collection workflow: later cash/bank receipt clears the receivable
- Reporting: outstanding balances per customer, aged receivables
