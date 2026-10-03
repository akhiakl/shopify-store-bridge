-- Groups → connections: a pairing is now one source store and one target
-- store (table "Connection"), and a sync job belongs to one connection and
-- carries its own progress/counts (the per-target "SyncJobTarget" row is
-- folded into "SyncJob"). Existing pairings and job history are kept.
-- Hand-written: drizzle-kit can't express the data moves (or ask its
-- rename questions non-interactively). The snapshot matches the schema.

-- 1. Connection: one row per (source, target) pair, reusing the
--    SyncGroupTarget id. If a source invited the same target in two
--    groups, keep the approved (else newest) one; jobs are matched by
--    store pair below, so both groups' history lands on it.
ALTER TYPE "public"."SyncGroupTargetStatus" RENAME TO "ConnectionStatus";--> statement-breakpoint
CREATE TABLE "Connection" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"sourceStoreId" text NOT NULL,
	"targetStoreId" text NOT NULL,
	"status" "ConnectionStatus" DEFAULT 'PENDING' NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp,
	"authTokenHash" text,
	"authTokenExpiresAt" timestamp,
	CONSTRAINT "Connection_authTokenHash_unique" UNIQUE("authTokenHash")
);
--> statement-breakpoint
ALTER TABLE "Connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_sourceStoreId_Store_id_fk" FOREIGN KEY ("sourceStoreId") REFERENCES "public"."Store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_targetStoreId_Store_id_fk" FOREIGN KEY ("targetStoreId") REFERENCES "public"."Store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_sourceStoreId_targetStoreId_key" ON "Connection" USING btree ("sourceStoreId","targetStoreId");--> statement-breakpoint
CREATE POLICY "Connection_service_role_only" ON "Connection" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
INSERT INTO "Connection" ("id", "sourceStoreId", "targetStoreId", "status", "requestedAt", "respondedAt", "authTokenHash", "authTokenExpiresAt")
SELECT DISTINCT ON (g."sourceId", t."storeId")
	t."id", g."sourceId", t."storeId", t."status", t."requestedAt", t."respondedAt", t."authTokenHash", t."authTokenExpiresAt"
FROM "SyncGroupTarget" t
JOIN "SyncGroup" g ON g."id" = t."groupId"
ORDER BY g."sourceId", t."storeId", (t."status" = 'APPROVED') DESC, t."requestedAt" DESC;--> statement-breakpoint

-- 2. SyncJob gains the per-target columns, then each old job is split
--    into one job per target it ran for, reusing the SyncJobTarget id so
--    its SyncJobItem rows need no remapping.
ALTER TABLE "SyncJob" ADD COLUMN "connectionId" text;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "itemsSynced" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "itemsSkipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "itemsFailed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "stepsDone" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD COLUMN "stepsTotal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "SyncJob" ("id", "groupId", "connectionId", "selection", "status", "startedAt", "finishedAt", "plan", "lockedUntil", "errorMessage", "itemsSynced", "itemsSkipped", "itemsFailed", "stepsDone", "stepsTotal")
SELECT
	jt."id", j."groupId", c."id", j."selection",
	-- A target still PENDING is mid-run: keep the job's QUEUED/RUNNING.
	-- Compared as text: on a fresh database every migration runs in one
	-- transaction, and Postgres 16 rejects using an enum value (PENDING,
	-- added by 0005) in the transaction that added it.
	CASE jt."status"::text
		WHEN 'PENDING' THEN j."status"
		WHEN 'SUCCEEDED' THEN 'SUCCEEDED'::"SyncJobStatus"
		ELSE 'FAILED'::"SyncJobStatus"
	END,
	j."startedAt", j."finishedAt",
	-- The plan is only needed to finish an unfinished target.
	CASE WHEN jt."status"::text = 'PENDING' THEN j."plan" END,
	NULL,
	COALESCE(jt."errorMessage", j."errorMessage"),
	jt."itemsSynced", jt."itemsSkipped", jt."itemsFailed", jt."stepsDone", jt."stepsTotal"
FROM "SyncJobTarget" jt
JOIN "SyncJob" j ON j."id" = jt."jobId"
JOIN "SyncGroup" g ON g."id" = j."groupId"
JOIN "Connection" c ON c."sourceStoreId" = g."sourceId" AND c."targetStoreId" = jt."storeId";--> statement-breakpoint
-- Jobs that never reached planning (still queued, or failed reading the
-- source) have no target rows: copy one per connection their group had,
-- limited to the job's own target when a target started it.
INSERT INTO "SyncJob" ("id", "groupId", "connectionId", "selection", "status", "startedAt", "finishedAt", "plan", "lockedUntil", "errorMessage")
SELECT
	gen_random_uuid()::text, j."groupId", c."id", j."selection", j."status",
	j."startedAt", j."finishedAt", NULL, NULL, j."errorMessage"
FROM "SyncJob" j
JOIN "SyncGroup" g ON g."id" = j."groupId"
JOIN "SyncGroupTarget" t ON t."groupId" = g."id"
JOIN "Connection" c ON c."sourceStoreId" = g."sourceId" AND c."targetStoreId" = t."storeId"
WHERE j."connectionId" IS NULL
	AND (j."targetStoreId" IS NULL OR j."targetStoreId" = t."storeId")
	AND NOT EXISTS (SELECT 1 FROM "SyncJobTarget" jt WHERE jt."jobId" = j."id");--> statement-breakpoint

-- 3. SyncJobItem points at the job directly (same id as its old target).
ALTER TABLE "SyncJobItem" ADD COLUMN "jobId" text;--> statement-breakpoint
UPDATE "SyncJobItem" SET "jobId" = "jobTargetId";--> statement-breakpoint
ALTER TABLE "SyncJobItem" DROP COLUMN "jobTargetId";--> statement-breakpoint
DELETE FROM "SyncJobItem" i WHERE NOT EXISTS (SELECT 1 FROM "SyncJob" j WHERE j."id" = i."jobId");--> statement-breakpoint
ALTER TABLE "SyncJobItem" ALTER COLUMN "jobId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJobItem" ADD CONSTRAINT "SyncJobItem_jobId_SyncJob_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."SyncJob"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 4. Drop the pre-split jobs (cascading to SyncJobTarget) and the old
--    tables, columns and type.
DELETE FROM "SyncJob" WHERE "connectionId" IS NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" DROP COLUMN "groupId";--> statement-breakpoint
ALTER TABLE "SyncJob" DROP COLUMN "targetStoreId";--> statement-breakpoint
ALTER TABLE "SyncJob" ALTER COLUMN "connectionId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_connectionId_Connection_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."Connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP TABLE "SyncJobTarget";--> statement-breakpoint
DROP TYPE "public"."SyncJobTargetStatus";--> statement-breakpoint
DROP TABLE "SyncGroupTarget";--> statement-breakpoint
DROP TABLE "SyncGroup";
