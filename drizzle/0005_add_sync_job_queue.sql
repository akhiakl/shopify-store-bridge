ALTER TYPE "public"."SyncJobStatus" ADD VALUE 'QUEUED' BEFORE 'RUNNING';--> statement-breakpoint
ALTER TYPE "public"."SyncJobTargetStatus" ADD VALUE 'PENDING' BEFORE 'SUCCEEDED';--> statement-breakpoint
ALTER TABLE "SyncJobTarget" ADD COLUMN "stepsDone" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJobTarget" ADD COLUMN "stepsTotal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "lockedUntil" timestamp;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "errorMessage" text;--> statement-breakpoint
-- Jobs the old synchronous runner left RUNNING (a request that died
-- mid-sync) have no plan and no lock, so the background worker would treat
-- them as stalled and re-run an old selection. Close them out instead.
-- Uses only pre-existing enum values, so it's safe in this transaction.
UPDATE "SyncJob" SET "status" = 'FAILED', "finishedAt" = now() WHERE "status" = 'RUNNING';
