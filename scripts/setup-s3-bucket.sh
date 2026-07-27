#!/usr/bin/env bash
# Idempotent S3 bucket + IAM user + policy + CORS for fidexa-inventory-images.
# Requires: aws cli configured with admin credentials.

set -euo pipefail

BUCKET="${BUCKET:-fidexa-inventory-images}"
REGION="${REGION:-eu-west-1}"
IAM_USER="${IAM_USER:-fidexa-inventory-uploader}"

echo "→ Creating bucket $BUCKET in $REGION (idempotent)"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

echo "→ Disabling block-public-access on bucket"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo "→ Applying public-read policy on products/* and items/* prefixes"
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadProductImages",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": [
      "arn:aws:s3:::$BUCKET/products/*",
      "arn:aws:s3:::$BUCKET/items/*"
    ]
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY"

echo "→ Applying CORS for browser PUT and GET"
CORS=$(cat <<JSON
{
  "CORSRules": [{
    "AllowedOrigins": ["https://inventory.fidexa.org","http://localhost:3000"],
    "AllowedMethods": ["PUT","GET","HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
JSON
)
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "$CORS"

echo "→ Creating IAM user $IAM_USER (idempotent)"
aws iam create-user --user-name "$IAM_USER" 2>/dev/null || true

echo "→ Attaching tight inline policy"
INLINE=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"],
    "Resource": [
      "arn:aws:s3:::$BUCKET/products/*",
      "arn:aws:s3:::$BUCKET/items/*"
    ]
  }]
}
JSON
)
aws iam put-user-policy --user-name "$IAM_USER" \
  --policy-name InventoryUploaderPolicy --policy-document "$INLINE"

KEY_COUNT=$(aws iam list-access-keys --user-name "$IAM_USER" \
  --query "length(AccessKeyMetadata)" --output text)
if [ "$KEY_COUNT" = "0" ]; then
  aws iam create-access-key --user-name "$IAM_USER" \
    --query "AccessKey.{Key:AccessKeyId,Secret:SecretAccessKey}" \
    --output table
  echo ""
  echo "↑↑ Copy these into .env.local, .env.test, and the wrangler secret store."
fi

echo "✓ Done."
