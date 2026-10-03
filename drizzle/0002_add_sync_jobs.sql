CREATE TYPE "public"."SyncJobStatus" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."SyncJobTargetStatus" AS ENUM('SUCCEEDED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "SyncJobTarget" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"jobId" text NOT NULL,
	"storeId" text NOT NULL,
	"status" "SyncJobTargetStatus" NOT NULL,
	"itemsSynced" integer DEFAULT 0 NOT NULL,
	"itemsFailed" integer DEFAULT 0 NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
ALTER TABLE "SyncJobTarget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "SyncJob" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"groupId" text NOT NULL,
	"selection" jsonb NOT NULL,
	"status" "SyncJobStatus" DEFAULT 'RUNNING' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "SyncJob" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "SyncJobTarget" ADD CONSTRAINT "SyncJobTarget_jobId_SyncJob_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."SyncJob"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SyncJobTarget" ADD CONSTRAINT "SyncJobTarget_storeId_Store_id_fk" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_groupId_SyncGroup_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."SyncGroup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "SyncJobTarget_service_role_only" ON "SyncJobTarget" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "SyncJob_service_role_only" ON "SyncJob" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);