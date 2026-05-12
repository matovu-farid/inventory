import { AwsClient } from "aws4fetch"
import { env } from "#/env"

const PRESIGN_EXPIRY_SECONDS = 300

function awsClient(): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "s3",
  })
}

export function publicUrlFor(key: string): string {
  return `https://${env.S3_PRODUCT_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}

export async function presignPutUrl(params: {
  key: string
  contentType: string
}): Promise<string> {
  const client = awsClient()
  const url = new URL(publicUrlFor(params.key))
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRY_SECONDS))
  const signed = await client.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": params.contentType },
    }),
    { aws: { signQuery: true } },
  )
  return signed.url
}
