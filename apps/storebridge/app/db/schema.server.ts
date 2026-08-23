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

// --- ENUMS ---
export const syncGroupTargetStatusEnum = pgEnum("SyncGroupTargetStatus", [
  "PENDING",
  "APPROVED",
  "DECLINED",
]);

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
 */
export const sessions = pgTable("Session", {
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
});

/** A Shopify shop that has StoreBridge installed. Kept separate from
 * `sessions` (auth/token state only) — this is where StoreBridge's own
 * business data about a shop anchors. */
export const stores = pgTable("Store", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  shop: text("shop").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

/** A source store's collection of paired target stores. The store the
 * merchant is currently in when they create a group is always the
 * source — there's no source picker. */
export const syncGroups = pgTable("SyncGroup", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: text("name"),
  sourceId: text("sourceId")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

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
  ],
);

// --- DRIZZLE RELATIONS ---

export const storesRelations = relations(stores, ({ many }) => ({
  sourcedGroups: many(syncGroups, { relationName: "SyncGroupSource" }),
  targetMemberships: many(syncGroupTargets, {
    relationName: "SyncGroupTargetStore",
  }),
}));

export const syncGroupsRelations = relations(syncGroups, ({ one, many }) => ({
  source: one(stores, {
    fields: [syncGroups.sourceId],
    references: [stores.id],
    relationName: "SyncGroupSource",
  }),
  targets: many(syncGroupTargets),
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
