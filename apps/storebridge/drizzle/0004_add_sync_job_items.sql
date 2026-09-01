CREATE TYPE "public"."SyncJobItemKind" AS ENUM('DEFINITION', 'VALUE');--> statement-breakpoint
CREATE TYPE "public"."SyncJobItemStatus" AS ENUM('SUCCEEDED', 'SKIPPED', 'FAILED');--> statement-breakpoint
CREATE TABLE "SyncJobItem" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"jobTargetId" text NOT NULL,
	"key" text NOT NULL,
	"kind" "SyncJobItemKind" NOT NULL,
	"status" "SyncJobItemStatus" NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
ALTER TABLE "SyncJobItem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "SyncJobItem" ADD CONSTRAINT "SyncJobItem_jobTargetId_SyncJobTarget_id_fk" FOREIGN KEY ("jobTargetId") REFERENCES "public"."SyncJobTarget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "SyncJobItem_service_role_only" ON "SyncJobItem" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);