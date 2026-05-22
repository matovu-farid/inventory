-- Tightens audit_logs.description to NOT NULL after the backfill in Task 6
-- populated all historical rows. Documentation-only; this repo uses
-- drizzle-kit push, so the schema TS in src/db/schema/audit-logs.ts is the
-- source of truth and was the actual driver of this change.

ALTER TABLE "audit_logs" ALTER COLUMN "description" SET NOT NULL;
