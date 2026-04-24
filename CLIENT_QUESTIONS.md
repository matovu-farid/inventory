# Client Questions

Outstanding questions that need client input before finalizing requirements.

---

### 1. Damaged Goods Handling

When goods arrive at the store damaged, or get damaged at a shop, how should the system handle them?

- (a) **Write them off immediately** — mark as a loss, post to ledger as expense
- (b) **Track separately** — mark as damaged, option to sell at a discount later or write off *(currently our default assumption)*
- (c) **Don't track damage explicitly** — just let stock taking catch discrepancies

**Our recommendation:** Option (b). Tracking damaged goods separately lets you distinguish between theft/shrinkage and damage in loss reports, and keeps the option to sell at a discount rather than writing everything off.

---

### 2. Returns / Reverse Flow of Goods

Can goods flow backwards in the system?

- (a) A shop can return unsold goods back to the store
- (b) A customer can return goods to a shop after purchase
- (c) Both
- (d) **Neither — goods only flow forward** *(currently our default assumption)*

**Why this matters:** If returns are needed, we need reverse journal entries, restocking workflows, and refund tracking. If not, the system stays simpler.
