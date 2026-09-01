import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { serviceRole } from "drizzle-orm/supabase";

// --- ENUMS ---
export const syncGroupTargetStatusEnum = pgEnum("SyncGroupTargetStatus", [
  "PENDING",
  "APPROVED",
  "DECLINED",
]);

/** Rollup of a job's `SyncJobTarget` rows: SUCCEEDED/FAILED only when every
 * target agreed, PARTIAL when they didn't. */
export const syncJobStatusEnum = pgEnum("SyncJobStatus", [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
]);

/** SKIPPED covers a target that dropped out of APPROVED between the
 * checkbox UI loading and the sync actually running (declined, or its
 * session got revoked) — the job still records it rather than silently
 * omitting it. */
export const syncJobTargetStatusEnum = pgEnum("SyncJobTargetStatus", [
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
]);

// --- ROW LEVEL SECURITY ---
// RLS is enabled on every table below (defense-in-depth, tracked here so
// drizzle-kit generate keeps the migration/snapshot in sync with intent).
// The app itself never needs a policy to work: app/db.server.ts connects
// with Supabase's `postgres` role, which has BYPASSRLS and ignores these
// entirely. What this guards against is anything else reaching these
// tables through Supabase's PostgREST/client-library path — a leaked
// anon/authenticated key, or the connection ever being switched to
// Supavisor's `service_role` transaction mode. Each table gets exactly
// one explicit "service_role, full access" policy; `anon`/`authenticated`
// get none, so RLS's default-deny applies to them. (`sessions` below
// skips the `.enableRLS()` builder call for a type reason explained on
// that table — RLS is still on for it, just enabled outside this schema.)
function serviceRoleOnly(tableName: string) {
  return pgPolicy(`${tableName}_service_role_only`, {
    as: "permissive",
    for: "all",
    to: serviceRole,
    using: sql`true`,
    withCheck: sql`true`,
  });
}

// --- TABLES ---
// Table/column names below match the live Supabase tables 1:1 (originally
// created by Prisma's migrations, now removed in favor of this schema) so
// no data migration is needed. Don't "clean up" the PascalCase table names
// or camelCase columns without a real rename migration against Supabase.

/**
 * Shopify session/token storage. Column names/modifiers here also have to
 * stay identical to
 * @shopify/shopify-app-session-storage-drizzle's own reference schema
 * (postgres.schema.ts) — DrizzleSessionStoragePostgres's constructor takes
 * `PostgresSessionTable = typeof sessionTable` from that file, and
 * Drizzle's PgColumn generics encode the column name/nullability/default
 * literally, so any deviation breaks the type. Don't touch this table
 * without checking that file first.
 *
 * No `.enableRLS()` chain here (unlike the other tables below) — it
 * changes the table's type to `Omit<PgTableWithColumns<T>, 'enableRLS'>`,
 * which no longer satisfies `PostgresSessionTable`. RLS is already ON for
 * this table (enabled directly in Supabase); only the policy is declared
 * here so drizzle-kit generate emits the CREATE POLICY statement.
 */
export const sessions = pgTable(
  "Session",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    state: text("state").notNull(),
    isOnline: boolean("isOnline").default(false).notNull(),
    scope: text("scope"),
    expires: timestamp("expires", { mode: "date" }),
    accessToken: text("accessToken").notNull(),
    userId: bigint("userId", { mode: "number" }),
    firstName: text("firstName"),
    lastName: text("lastName"),
    email: text("email"),
    accountOwner: boolean("accountOwner"),
    locale: text("locale"),
    collaborator: boolean("collaborator"),
    emailVerified: boolean("emailVerified"),
    refreshToken: text("refreshToken"),
    refreshTokenExpires: timestamp("refreshTokenExpires", { mode: "date" }),
  },
  () => [serviceRoleOnly("Session")],
);

/** A Shopify shop that has StoreBridge installed. Kept separate from
 * `sessions` (auth/token state only) — this is where StoreBridge's own
 * business data about a shop anchors. */
export const stores = pgTable(
  "Store",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    shop: text("shop").notNull().unique(),
    name: text("name"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  () => [serviceRoleOnly("Store")],
).enableRLS();

/** A source store's collection of paired target stores. The store the
 * merchant is currently in when they create a group is always the
 * source — there's no source picker. */
export const syncGroups = pgTable(
  "SyncGroup",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: text("name"),
    sourceId: text("sourceId")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  () => [serviceRoleOnly("SyncGroup")],
).enableRLS();

/** One target store's membership in a sync group — the pairing "invite,"
 * requested from the source side. See pairing.server.ts's requestPairing
 * doc comment for why authTokenHash exists. */
export const syncGroupTargets = pgTable(
  "SyncGroupTarget",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    groupId: text("groupId")
      .notNull()
      .references(() => syncGroups.id, { onDelete: "cascade" }),
    storeId: text("storeId")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: syncGroupTargetStatusEnum("status").notNull().default("PENDING"),
    requestedAt: timestamp("requestedAt", { mode: "date" })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),
    authTokenHash: text("authTokenHash").unique(),
    authTokenExpiresAt: timestamp("authTokenExpiresAt", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("SyncGroupTarget_groupId_storeId_key").on(
      table.groupId,
      table.storeId,
    ),
    serviceRoleOnly("SyncGroupTarget"),
  ],
).enableRLS();

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

/** One target store's result within a `SyncJob` — counts, not a
 * per-definition log, per the YAGNI call in definition-sync.md; the exact
 * Shopify userError (if any) is kept in `errorMessage` for a target-level
 * failure (e.g. its session couldn't be loaded), not a per-item one. */
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
     * as an error; see sync.server.ts's createOne. */
    itemsSkipped: integer("itemsSkipped").notNull().default(0),
    itemsFailed: integer("itemsFailed").notNull().default(0),
    errorMessage: text("errorMessage"),
  },
  () => [serviceRoleOnly("SyncJobTarget")],
).enableRLS();

// --- DRIZZLE RELATIONS ---

export const storesRelations = relations(stores, ({ many }) => ({
  sourcedGroups: many(syncGroups, { relationName: "SyncGroupSource" }),
  targetMemberships: many(syncGroupTargets, {
    relationName: "SyncGroupTargetStore",
  }),
  syncJobTargets: many(syncJobTargets),
}));

export const syncGroupsRelations = relations(syncGroups, ({ one, many }) => ({
  source: one(stores, {
    fields: [syncGroups.sourceId],
    references: [stores.id],
    relationName: "SyncGroupSource",
  }),
  targets: many(syncGroupTargets),
  jobs: many(syncJobs),
}));

export const syncGroupTargetsRelations = relations(
  syncGroupTargets,
  ({ one }) => ({
    group: one(syncGroups, {
      fields: [syncGroupTargets.groupId],
      references: [syncGroups.id],
    }),
    store: one(stores, {
      fields: [syncGroupTargets.storeId],
      references: [stores.id],
      relationName: "SyncGroupTargetStore",
    }),
  }),
);

export const syncJobsRelations = relations(syncJobs, ({ one, many }) => ({
  group: one(syncGroups, {
    fields: [syncJobs.groupId],
    references: [syncGroups.id],
  }),
  targets: many(syncJobTargets),
}));

export const syncJobTargetsRelations = relations(syncJobTargets, ({ one }) => ({
  job: one(syncJobs, {
    fields: [syncJobTargets.jobId],
    references: [syncJobs.id],
  }),
  store: one(stores, {
    fields: [syncJobTargets.storeId],
    references: [stores.id],
  }),
}));
