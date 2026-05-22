-- Audit log enrichment: add description, article_numbers, business_date columns
-- plus indexes for business_date and a GIN index for article_numbers filtering.
-- `description` is intentionally NULLABLE here so a follow-up backfill task can
-- populate historical rows before being tightened to NOT NULL in a later migration.

ALTER TABLE "audit_logs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "article_numbers" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "business_date" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_audit_business_date" ON "audit_logs" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "idx_audit_articles" ON "audit_logs" USING gin ("article_numbers");
