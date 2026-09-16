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
import { stores, syncGroups } from "./schema.server";

// Sync-job domain — split out of schema.server.ts (the pairing domain)
// once that file started pushing past the 300-line limit. `stores`/
// `syncGroups` are imported one-way from there; nothing in
// schema.server.ts imports back from here, so there's no circular
// module dependency. db.server.ts combines both files' exports into one
// schema object for drizzle().

// --- ENUMS ---

/** Rollup of a job's `SyncJobTarget` rows: SUCCEEDED/FAILED only when every
 * target agreed, PARTIAL when they didn't. */
export const syncJobStatusEnum = pgEnum("SyncJobStatus", [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
]);

/** SKIPPED is reserved for a target that drops out of APPROVED between
 * the checkbox UI loading and the sync actually running (declined, or its
 * session got revoked) — runSyncJob doesn't emit it yet (it only iterates
 * the APPROVED targets it read at the start), so this status is currently
 * unused; kept here so job history has somewhere to put that case once it
 * is handled rather than needing a migration then. */
export const syncJobTargetStatusEnum = pgEnum("SyncJobTargetStatus", [
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
]);

/** Per-item outcome within a `SyncJobTarget` — same three-way split
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

/** One "Sync now" click for a group — pushes the selected metafield/metaobject
 * definitions (see app.groups.$groupId.definitions/sync.server.ts) from the
 * group's source store to each of its APPROVED targets. `selection` is the
 * raw definition keys the UI submitted (same `metaobject:<type>` /
 * `metafield:<ownerType>:<namespace>:<key>` keys the checkboxes use) — kept
 * verbatim so job history can show what was actually requested, not just
 * the outcome. */
export const syncJobs = pgTable(
  "SyncJob",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    groupId: text("groupId")
      .notNull()
      .references(() => syncGroups.id, { onDelete: "cascade" }),
    selection: jsonb("selection").$type<string[]>().notNull(),
    status: syncJobStatusEnum("status").notNull().default("RUNNING"),
    startedAt: timestamp("startedAt", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finishedAt", { mode: "date" }),
  },
  () => [serviceRoleOnly("SyncJob")],
).enableRLS();

/** One target store's result within a `SyncJob` — item counts for an
 * at-a-glance summary; the exact Shopify userError (if any) is kept in
 * `errorMessage` for a target-level failure (e.g. its session couldn't be
 * loaded), not a per-item one. Per-item detail lives in `SyncJobItem`. */
export const syncJobTargets = pgTable(
  "SyncJobTarget",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    jobId: text("jobId")
      .notNull()
      .references(() => syncJobs.id, { onDelete: "cascade" }),
    storeId: text("storeId")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: syncJobTargetStatusEnum("status").notNull(),
    itemsSynced: integer("itemsSynced").notNull().default(0),
    /** Already existed on the target (Shopify's `TAKEN` userError code) —
     * counted separately from itemsFailed so a clean re-run doesn't read
     * as an error; see syncTarget.server.ts's createOne. */
    itemsSkipped: integer("itemsSkipped").notNull().default(0),
    itemsFailed: integer("itemsFailed").notNull().default(0),
    errorMessage: text("errorMessage"),
  },
  () => [serviceRoleOnly("SyncJobTarget")],
).enableRLS();

/** One definition (or SHOP-metafield value) attempted within a
 * `SyncJobTarget` — lets job history answer "which one failed," not just
 * "how many." `key` reuses the same selection-key format the checkbox UI
 * and sync.server.ts's parseSelection already use (`metaobject:<type>` /
 * `metafield:<ownerType>:<namespace>:<key>`); `kind` distinguishes a
 * definition item from the value-sync item that can follow a SHOP
 * metafield definition. */
export const syncJobItems = pgTable(
  "SyncJobItem",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    jobTargetId: text("jobTargetId")
      .notNull()
      .references(() => syncJobTargets.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    kind: syncJobItemKindEnum("kind").notNull(),
    status: syncJobItemStatusEnum("status").notNull(),
    errorMessage: text("errorMessage"),
  },
  () => [serviceRoleOnly("SyncJobItem")],
).enableRLS();

// --- DRIZZLE RELATIONS ---

export const syncJobsRelations = relations(syncJobs, ({ one, many }) => ({
  group: one(syncGroups, {
    fields: [syncJobs.groupId],
    references: [syncGroups.id],
  }),
  targets: many(syncJobTargets),
}));

export const syncJobTargetsRelations = relations(
  syncJobTargets,
  ({ one, many }) => ({
    job: one(syncJobs, {
      fields: [syncJobTargets.jobId],
      references: [syncJobs.id],
    }),
    store: one(stores, {
      fields: [syncJobTargets.storeId],
      references: [stores.id],
    }),
    items: many(syncJobItems),
  }),
);

export const syncJobItemsRelations = relations(syncJobItems, ({ one }) => ({
  jobTarget: one(syncJobTargets, {
    fields: [syncJobItems.jobTargetId],
    references: [syncJobTargets.id],
  }),
}));
