import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { inArray } from "drizzle-orm";

/**
 * Data + auth setup for scripts/screenshot-app.mjs. Deliberately separate
 * from e2e/support/* (those are .ts, loaded by the Playwright test runner;
 * this is a plain-Node script) rather than sharing a loader — small enough
 * that duplicating the session-token signing and table shapes here is
 * cheaper than wiring cross-runtime TS imports for one script. Table/column
 * names must stay in sync with app/db/schema.server.ts.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const syncGroupTargetStatusEnum = pgEnum("SyncGroupTargetStatus", [
  "PENDING",
  "APPROVED",
  "DECLINED",
]);

const sessions = pgTable("Session", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  state: text("state").notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  scope: text("scope"),
  expires: timestamp("expires", { mode: "date" }),
  accessToken: text("accessToken").notNull(),
});

const stores = pgTable("Store", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull().unique(),
});

const syncGroups = pgTable("SyncGroup", {
  id: text("id").primaryKey(),
  name: text("name"),
  sourceId: text("sourceId").notNull(),
});

const syncGroupTargets = pgTable("SyncGroupTarget", {
  id: text("id").primaryKey(),
  groupId: text("groupId").notNull(),
  storeId: text("storeId").notNull(),
  status: syncGroupTargetStatusEnum("status").notNull().default("PENDING"),
  respondedAt: timestamp("respondedAt", { mode: "date" }),
});

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Signs a session token the same way e2e/support/session-token.ts does. */
export function signSessionToken(shop, apiKey, apiSecretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: `https://${shop}/admin`,
    dest: `https://${shop}`,
    aud: apiKey,
    sub: "1",
    exp: now + 300,
    nbf: now - 10,
    iat: now,
    jti: randomUUID(),
    sid: randomUUID(),
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    createHmac("sha256", apiSecretKey).update(data).digest(),
  );
  return `${data}.${signature}`;
}

async function seedInstalledShop(shop) {
  await db
    .insert(sessions)
    .values({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      scope: process.env.SCOPES ?? "",
      accessToken: "screenshot-fixture-token",
      expires: null,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: { accessToken: "screenshot-fixture-token", expires: null },
    });
}

async function upsertStore(shop) {
  const [store] = await db
    .insert(stores)
    .values({ shop })
    .onConflictDoUpdate({ target: stores.shop, set: { shop } })
    .returning();
  return store;
}

const SCREENSHOT_SHOPS = [
  "storebridge-screenshot-empty.myshopify.com",
  "storebridge-screenshot-main.myshopify.com",
  "storebridge-screenshot-target.myshopify.com",
  "storebridge-screenshot-partner.myshopify.com",
  "storebridge-screenshot-approved.myshopify.com",
];

/**
 * Deletes any leftover Store/Session rows from a previous run of this
 * script, so re-running it doesn't pile up duplicate SyncGroups (Store
 * deletion cascades to its groups/memberships - see
 * app/db/schema.server.ts).
 */
export async function resetScenarios() {
  await db.delete(stores).where(inArray(stores.shop, SCREENSHOT_SHOPS));
  await db.delete(sessions).where(inArray(sessions.shop, SCREENSHOT_SHOPS));
}

/**
 * Seeds an empty-state shop (installed, nothing paired yet) and a
 * populated one (an owned group, an incoming request, and a resolved
 * membership) so the two screenshots show StoreBridge before and after
 * real use. Returns the shop domains to render.
 */
export async function seedScenarios() {
  await resetScenarios();
  const [emptyShop, mainShop, targetShop, partnerShop, approvedSourceShop] =
    SCREENSHOT_SHOPS;

  await Promise.all(SCREENSHOT_SHOPS.map(seedInstalledShop));

  const mainStore = await upsertStore(mainShop);
  const targetStore = await upsertStore(targetShop);
  const partnerStore = await upsertStore(partnerShop);
  const approvedSourceStore = await upsertStore(approvedSourceShop);

  const [ownedGroup] = await db
    .insert(syncGroups)
    .values({ sourceId: mainStore.id, name: "EU expansion" })
    .returning();
  await db
    .insert(syncGroupTargets)
    .values({ groupId: ownedGroup.id, storeId: targetStore.id });

  const [incomingGroup] = await db
    .insert(syncGroups)
    .values({ sourceId: partnerStore.id, name: "Wholesale rollout" })
    .returning();
  await db
    .insert(syncGroupTargets)
    .values({ groupId: incomingGroup.id, storeId: mainStore.id });

  const [approvedGroup] = await db
    .insert(syncGroups)
    .values({ sourceId: approvedSourceStore.id, name: "Franchise sync" })
    .returning();
  await db.insert(syncGroupTargets).values({
    groupId: approvedGroup.id,
    storeId: mainStore.id,
    status: "APPROVED",
    respondedAt: new Date(),
  });

  return { emptyShop, mainShop };
}

export async function teardown() {
  await pool.end();
}
