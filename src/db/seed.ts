import { db } from "./index"
import { transactionCategories } from "./schema"

const DEFAULT_CATEGORIES = [
  // Assets
  { name: "Cash", type: "asset" as const },
  { name: "Bank", type: "asset" as const },
  { name: "Inventory - Store", type: "asset" as const },
  { name: "Inventory - Shop", type: "asset" as const },
  { name: "Due from Shop", type: "asset" as const },

  // Liabilities
  { name: "Supplier Payable", type: "liability" as const },
  { name: "Due to Store", type: "liability" as const },

  // Equity
  { name: "Owner's Equity", type: "equity" as const },

  // Revenue
  { name: "Sales Revenue", type: "revenue" as const },
  { name: "Store Transfer Revenue", type: "revenue" as const },

  // Expenses
  { name: "Cost of Goods Sold", type: "expense" as const },
  { name: "Freight Expense", type: "expense" as const },
  { name: "Transportation Expense", type: "expense" as const },
  { name: "Customs Expense", type: "expense" as const },
  { name: "Travel Expense", type: "expense" as const },
  { name: "Rent Expense", type: "expense" as const },
  { name: "Salary Expense", type: "expense" as const },
  { name: "Tax Expense", type: "expense" as const },
  { name: "Inventory Loss", type: "expense" as const },
  { name: "Miscellaneous Expense", type: "expense" as const },
] as const

async function seed() {
  console.log("Seeding transaction categories...")

  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({
        name: cat.name,
        type: cat.type,
        isDefault: true,
      })
      .onConflictDoNothing()
  }

  console.log(`Seeded ${DEFAULT_CATEGORIES.length} transaction categories.`)
  process.exit(0)
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
