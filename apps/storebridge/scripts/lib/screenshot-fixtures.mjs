import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Data + auth setup for scripts/screenshot-app.mjs. Deliberately separate
 * from e2e/support/* (those are .ts, loaded by the Playwright test runner;
 * this is a plain-Node script) rather than sharing a loader — small enough
 * that duplicating the session-token signing here is cheaper than wiring
 * cross-runtime TS imports for one script.
 */

const prisma = new PrismaClient();

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
  await prisma.session.upsert({
    where: { id: `offline_${shop}` },
    create: {
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      scope: process.env.SCOPES ?? "",
      accessToken: "screenshot-fixture-token",
      expires: null,
    },
    update: { accessToken: "screenshot-fixture-token", expires: null },
  });
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
 * deletion cascades to its groups/memberships - see prisma/schema.prisma).
 */
export async function resetScenarios() {
  await prisma.store.deleteMany({ where: { shop: { in: SCREENSHOT_SHOPS } } });
  await prisma.session.deleteMany({
    where: { shop: { in: SCREENSHOT_SHOPS } },
  });
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

  const mainStore = await prisma.store.upsert({
    where: { shop: mainShop },
    create: { shop: mainShop },
    update: {},
  });
  const targetStore = await prisma.store.upsert({
    where: { shop: targetShop },
    create: { shop: targetShop },
    update: {},
  });
  const partnerStore = await prisma.store.upsert({
    where: { shop: partnerShop },
    create: { shop: partnerShop },
    update: {},
  });
  const approvedSourceStore = await prisma.store.upsert({
    where: { shop: approvedSourceShop },
    create: { shop: approvedSourceShop },
    update: {},
  });

  const ownedGroup = await prisma.syncGroup.create({
    data: { sourceId: mainStore.id, name: "EU expansion" },
  });
  await prisma.syncGroupTarget.create({
    data: { groupId: ownedGroup.id, storeId: targetStore.id },
  });

  const incomingGroup = await prisma.syncGroup.create({
    data: { sourceId: partnerStore.id, name: "Wholesale rollout" },
  });
  await prisma.syncGroupTarget.create({
    data: { groupId: incomingGroup.id, storeId: mainStore.id },
  });

  const approvedGroup = await prisma.syncGroup.create({
    data: { sourceId: approvedSourceStore.id, name: "Franchise sync" },
  });
  await prisma.syncGroupTarget.create({
    data: {
      groupId: approvedGroup.id,
      storeId: mainStore.id,
      status: "APPROVED",
      respondedAt: new Date(),
    },
  });

  return { emptyShop, mainShop };
}

export async function teardown() {
  await prisma.$disconnect();
}
