import {
  bigint,
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import { serviceRoleOnly } from "./rls.server";

// --- ENUMS ---
export const connectionStatusEnum = pgEnum("ConnectionStatus", [
  "PENDING",
  "APPROVED",
  "DECLINED",
]);

// --- TABLES ---
// Table/column names below match the live Supabase tables 1:1 (originally
// created by Prisma's migrations, now removed in favor of this schema) so
// no data migration is needed. Don't "clean up" the PascalCase table names
// or camelCase columns without a real rename migration against Supabase.
//
// This file holds the pairing domain (Session/Store/Connection): see syncJobsSchema.server.ts for the sync-job
// domain, split out once this file started pushing past the 300-line
// limit. RLS policies for both live in rls.server.ts's serviceRoleOnly.

/**
 * Shopify session/token storage. Column names/modifiers here also have to
 * stay identical to
 * @shopify/shopify-app-session-storage-drizzle's own reference schema
 * (postgres.schema.ts): DrizzleSessionStoragePostgres's constructor takes
 * `PostgresSessionTable = typeof sessionTable` from that file, and
 * Drizzle's PgColumn generics encode the column name/nullability/default
 * literally, so any deviation breaks the type. Don't touch this table
 * without checking that file first.
 *
 * No `.enableRLS()` chain here (unlike the other tables below): it
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
 * `sessions` (auth/token state only): this is where StoreBridge's own
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

/** One source store paired with one target store: the pairing
 * "invite," requested from the source side and approved by the target.
 * A connection has exactly one target; syncing to several stores means
 * one connection each. See pairing.server.ts's requestPairing doc comment
 * for why authTokenHash exists. */
export const connections = pgTable(
  "Connection",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    sourceStoreId: text("sourceStoreId")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    targetStoreId: text("targetStoreId")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: connectionStatusEnum("status").notNull().default("PENDING"),
    requestedAt: timestamp("requestedAt", { mode: "date" })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),
    authTokenHash: text("authTokenHash").unique(),
    authTokenExpiresAt: timestamp("authTokenExpiresAt", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("Connection_sourceStoreId_targetStoreId_key").on(
      table.sourceStoreId,
      table.targetStoreId,
    ),
    serviceRoleOnly("Connection"),
  ],
).enableRLS();

// --- DRIZZLE RELATIONS ---
// Sync-job-domain tables (SyncJob/SyncJobItem) declare their own
// `connection` one() relation pointing at `connections` in
// syncJobsSchema.server.ts: a table's relations() can be declared in a
// different file than the table itself, as long as both end up in the
// combined schema object db.server.ts passes to drizzle().

export const storesRelations = relations(stores, ({ many }) => ({
  outgoingConnections: many(connections, {
    relationName: "ConnectionSource",
  }),
  incomingConnections: many(connections, {
    relationName: "ConnectionTarget",
  }),
}));

export const connectionsRelations = relations(connections, ({ one }) => ({
  source: one(stores, {
    fields: [connections.sourceStoreId],
    references: [stores.id],
    relationName: "ConnectionSource",
  }),
  target: one(stores, {
    fields: [connections.targetStoreId],
    references: [stores.id],
    relationName: "ConnectionTarget",
  }),
}));
