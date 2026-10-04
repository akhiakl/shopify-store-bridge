import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import { serviceRoleOnly } from "./rls.server";
import { connections } from "./schema.server";

// Sync-job domain: split out of schema.server.ts (the pairing domain)
// once that file started pushing past the 300-line limit. `connections`
// is imported one-way from there; nothing in
// schema.server.ts imports back from here, so there's no circular
// module dependency. db.server.ts combines both files' exports into one
// schema object for drizzle().

// --- ENUMS ---

/** QUEUED until the background worker has read the plan from the source
 * (see utils/sync/syncWorker.server.ts), RUNNING while its steps are being
 * worked through, then SUCCEEDED, or FAILED if any item failed. PARTIAL
 * is no longer emitted: it meant "some targets failed" when a job could
 * have several; it stays in the enum for jobs recorded before that
 * (dropping a Postgres enum value means recreating the type). QUEUED is
 * set explicitly on insert rather than made the column default: Postgres
 * can't use an enum value in the same transaction that added it. */
export const syncJobStatusEnum = pgEnum("SyncJobStatus", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
]);

/** Per-item outcome within a `SyncJob`, same three-way split
 * `createOne` in syncTarget.server.ts already returns (ok / ok+skipped /
 * error), just persisted instead of only folded into a count. */
export const syncJobItemStatusEnum = pgEnum("SyncJobItemStatus", [
  "SUCCEEDED",
  "SKIPPED",
  "FAILED",
]);

/** Distinguishes a definition item from the value-sync item that can
 * follow a SHOP metafield definition (see syncTarget.server.ts). */
export const syncJobItemKindEnum = pgEnum("SyncJobItemKind", [
  "DEFINITION",
  "VALUE",
]);

// --- TABLES ---

/** One "Sync now" click on a connection: pushes the selected items from
 * the connection's source store to its target. `selection` is the raw
 * selection keys the UI submitted (`metaobject:<type>` /
 * `metafield:<ownerType>:<namespace>:<key>` etc., see
 * utils/sync/definitionKey.ts): kept verbatim so job history can show
 * what was actually requested, not just the outcome. */
export const syncJobs = pgTable(
  "SyncJob",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    connectionId: text("connectionId")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    selection: jsonb("selection").$type<string[]>().notNull(),
    status: syncJobStatusEnum("status").notNull().default("RUNNING"),
    startedAt: timestamp("startedAt", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finishedAt", { mode: "date" }),
    /** Everything this job pushes, read from the source once when the job
     * starts, so every later run works from the same snapshot. Cleared
     * when the job finishes. Shape: utils/sync/syncTarget.server.ts's
     * SyncPlan (not imported here, to keep db/ free of app imports). */
    plan: jsonb("plan"),
    /** Set while a worker run owns this job; a run that dies leaves it to
     * expire, after which another run can pick the job up. */
    lockedUntil: timestamp("lockedUntil", { mode: "date" }),
    /** Job-level failure, e.g. the source or target store couldn't be
     * reached. Per-item failures live in `SyncJobItem`. */
    errorMessage: text("errorMessage"),
    itemsSynced: integer("itemsSynced").notNull().default(0),
    /** Already existed on the target (Shopify's `TAKEN` userError code):
     * counted separately from itemsFailed so a clean re-run doesn't read
     * as an error; see syncTarget.server.ts's createOne. */
    itemsSkipped: integer("itemsSkipped").notNull().default(0),
    itemsFailed: integer("itemsFailed").notNull().default(0),
    /** Progress through the plan: the worker resumes from `stepsDone` on
     * its next run. */
    stepsDone: integer("stepsDone").notNull().default(0),
    stepsTotal: integer("stepsTotal").notNull().default(0),
  },
  () => [serviceRoleOnly("SyncJob")],
).enableRLS();

/** One item (definition, value, entry…) attempted within a `SyncJob`:
 * lets job history answer "which one failed," not just "how many." `key`
 * reuses the selection-key format from utils/sync/definitionKey.ts;
 * `kind` separates structure (DEFINITION) from content (VALUE). */
export const syncJobItems = pgTable(
  "SyncJobItem",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    jobId: text("jobId")
      .notNull()
      .references(() => syncJobs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    kind: syncJobItemKindEnum("kind").notNull(),
    status: syncJobItemStatusEnum("status").notNull(),
    errorMessage: text("errorMessage"),
  },
  () => [serviceRoleOnly("SyncJobItem")],
).enableRLS();

// --- DRIZZLE RELATIONS ---

export const syncJobsRelations = relations(syncJobs, ({ one, many }) => ({
  connection: one(connections, {
    fields: [syncJobs.connectionId],
    references: [connections.id],
  }),
  items: many(syncJobItems),
}));

export const syncJobItemsRelations = relations(syncJobItems, ({ one }) => ({
  job: one(syncJobs, {
    fields: [syncJobItems.jobId],
    references: [syncJobs.id],
  }),
}));
