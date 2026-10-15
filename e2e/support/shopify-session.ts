import { eq } from "drizzle-orm";

import db, { pool } from "~/db.server";
import { sessions } from "~/db/schema.server";

/**
 * Seeds a Session row that @shopify/shopify-app-react-router's
 * authenticate.admin() will treat as an already-active offline session:
 * confirmed by reading the installed package's token-exchange strategy
 * (strategies/token-exchange.js): it returns the existing session directly,
 * with no network call to Shopify, whenever `session.isActive()` is true.
 * That only requires a truthy `accessToken` and a null/never-expired
 * `expires`: see @shopify/shopify-api's lib/session/session.js.
 *
 * The row's id must be `offline_<shop>` to match
 * @shopify/shopify-api's getOfflineId(shop).
 */
export async function seedOfflineSession(
  shop: string,
  accessToken = "e2e-test-access-token",
): Promise<string> {
  const id = `offline_${shop}`;
  await db
    .insert(sessions)
    .values({
      id,
      shop,
      state: "",
      isOnline: false,
      scope: process.env.SCOPES ?? "",
      accessToken,
      expires: null,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: { accessToken, expires: null },
    });
  return id;
}

/**
 * Seeds the staff member's online session too: with `useOnlineTokens`
 * (#69), authenticate.admin() looks up `<shop>_<sub>` (shopify-api's
 * getJwtSessionId) instead of the offline row, and would otherwise try a
 * real token exchange. `userId` must match the session token's `sub`.
 */
export async function seedOnlineSession(
  shop: string,
  userId = 1,
  accessToken = "e2e-test-online-token",
): Promise<string> {
  const id = `${shop}_${userId}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db
    .insert(sessions)
    .values({
      id,
      shop,
      state: "",
      isOnline: true,
      scope: process.env.SCOPES ?? "",
      accessToken,
      expires,
      userId,
      firstName: "E2E",
      lastName: "Staff",
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: { accessToken, expires },
    });
  return id;
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function disconnectSessionStore(): Promise<void> {
  await pool.end();
}
