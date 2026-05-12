// src/lib/products.ts
const REGION = "eu-west-1"
const BUCKET = "fidexa-inventory-images"

export function productImageUrl(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`
}
