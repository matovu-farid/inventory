import BigNumber from "bignumber.js"

export function formatUgx(amount: string): string {
  const n = new BigNumber(amount)
  const isWhole = n.isInteger()
  const fixed = isWhole ? n.toFixed(0) : n.toFixed(2)
  // Add comma separators to the integer portion only
  const [intPart, decPart] = fixed.split(".")
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${decPart ? `${withCommas}.${decPart}` : withCommas} UGX`
}
