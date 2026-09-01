import { eq } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sessions, stores } from "../db/schema.server";

/**
 * Mandatory compliance webhook (shop/redact) — required before public App
 * Store submission, see
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance.
 * Sent 48 hours after a store owner uninstalls the app; erase everything
 * StoreBridge holds for that shop.
 *
 * Deleting the `Store` row cascades to everything keyed off it —
 * `SyncGroup` (as source), `SyncGroupTarget` (as target membership), and
 * from there `SyncJob`/`SyncJobTarget`/`SyncJobItem` — see schema.server.ts
 * and syncJobsSchema.server.ts's `onDelete: "cascade"` foreign keys. The
 * `Session` row is also deleted defensively even though
 * webhooks.app.uninstalled.tsx already does this on uninstall — this
 * webhook can in principle arrive without a prior uninstalled webhook
 * having been processed.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await db.delete(sessions).where(eq(sessions.shop, shop));
  await db.delete(stores).where(eq(stores.shop, shop));

  return new Response();
};
