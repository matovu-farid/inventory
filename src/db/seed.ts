import pg from "pg"

const DEFAULT_CATEGORIES = [
  // Assets
  { name: "Cash", type: "asset" },
  { name: "Bank", type: "asset" },
  { name: "Inventory - Store", type: "asset" },
  { name: "Inventory - Shop", type: "asset" },
  { name: "Accounts Receivable", type: "asset" },
  { name: "Due from Shop", type: "asset" },

  // Liabilities
  { name: "Supplier Payable", type: "liability" },
  { name: "Due to Store", type: "liability" },

  // Equity
  { name: "Owner's Equity", type: "equity" },

  // Revenue
  { name: "Sales Revenue", type: "revenue" },
  { name: "Sales Returns", type: "revenue" },
  { name: "Store Transfer Revenue", type: "revenue" },

  // Expenses
  { name: "Cost of Goods Sold", type: "expense" },
  { name: "Freight Expense", type: "expense" },
  { name: "Transportation Expense", type: "expense" },
  { name: "Customs Expense", type: "expense" },
  { name: "Travel Expense", type: "expense" },
  { name: "Rent Expense", type: "expense" },
  { name: "Salary Expense", type: "expense" },
  { name: "Tax Expense", type: "expense" },
  { name: "Inventory Loss", type: "expense" },
  { name: "Bad Debt Expense", type: "expense" },
  { name: "Miscellaneous Expense", type: "expense" },
] as const

async function seed() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  console.log("Seeding transaction categories...")

  try {
    for (const cat of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO transaction_categories (name, type, is_default)
         VALUES ($1, $2, true)
         ON CONFLICT DO NOTHING`,
        [cat.name, cat.type],
      )
    }
    console.log(`Seeded ${DEFAULT_CATEGORIES.length} transaction categories.`)
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
